require('dotenv').config();

const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const session = require('express-session');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

// ✅ Inizializza socket.io DOPO aver creato http
const io = new Server(http, {
  cors: { origin: '*' }
});

// ✅ Gestione connessioni WebSocket
io.on('connection', (socket) => {
  console.log('🔌 Client connesso via WebSocket');

  // 🔸 Utente clicca un posto
  socket.on('blocca-posto', ({ evento, posto }) => {
    socket.broadcast.emit('posto-bloccato', { evento, posto });
  });

  // 🔸 Utente conferma prenotazione
  socket.on('prenota-posti', ({ evento, posti }) => {
    io.emit('posti-prenotati', { evento, posti });
  });

  // 🔸 Utente libera un posto (o esce)
  socket.on('libera-posti', ({ evento, posti }) => {
    io.emit('posti-liberati', { evento, posti });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnesso');
  });
});



const bodyParser = require('body-parser'); // ← Sposta prima dell'uso
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const fs = require('fs');
const path = require('path');
const configDir = path.join(__dirname, 'config');

const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

// --- PostgreSQL setup ---
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Gestione sessioni con PostgreSQL ---
const pgSession = require('connect-pg-simple')(session);
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session' // verrà creata automaticamente
  }),
  secret: 'una-chiave-super-segreta',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 giorno
}));

// --- Endpoint di test connessione DB ---
app.get('/test-db-postgres', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, ora: result.rows[0].now });
  } catch (err) {
    console.error("❌ Errore connessione PostgreSQL:", err);
    res.status(500).json({ success: false, error: 'Connessione fallita' });
  }
});

// --- Base URL e utilità ---
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

function escapeHtml(unsafe) {
  return (unsafe || '').replace(/[&<>"']/g, function (m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m];
  });
}

function slugify(testo) {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// --- Verifica esistenza PDF (va prima dei file statici) ---
app.get('/api/pdf-exists/:evento/:filename', (req, res) => {
  const { evento, filename } = req.params;
  const filePath = path.join(__dirname, 'eventi', evento, 'PDF', filename);
  res.json({ exists: fs.existsSync(filePath) });
});

// --- Middleware ---
app.use(bodyParser.json({ limit: '10mb' }));

// 💾 Salva le modifiche della configurazione utente loggato
app.post('/salva-config-utente', requireLogin, async (req, res) => {

  const {
    nomeUtente,
    indirizzoUtente,
    imgIntest,
    notespdf
  } = req.body;

  const emailUtente = req.session.utente?.email;

  if (!emailUtente) {
    console.log('❌ Utente non autenticato');
    return res.status(401).json({ success: false, error: 'Utente non autenticato' });
  }

  try {
    const result = await pool.query(
      `UPDATE configurazione
       SET nome_utente = $1,
           indirizzo_utente = $2,
           img_intest = $3,
           notespdf = $4
       WHERE email_utente = $5`,
      [nomeUtente, indirizzoUtente, imgIntest, notespdf, emailUtente]
    );

    if (result.rowCount === 0) {
      console.log('❌ Nessun utente trovato per:', emailUtente);
      return res.status(404).json({ success: false, error: 'Utente non trovato' });
    }

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Errore PostgreSQL /salva-config-utente:', err);
    res.status(500).json({ success: false, error: 'Errore database' });
  }
});

// Protegge l'accesso a home.html → accesso solo se loggato
app.get('/home.html', (req, res, next) => {
  if (!req.session.utente) {
    return res.redirect('/login.html'); // 🔁 Reindirizza al login
  }
  return res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Protegge verifica.html
app.get('/verifica.html', (req, res) => {
  if (!req.session.utente) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'public', 'verifica.html'));
});

// Protegge modifica-svg.html
app.get('/modifica-svg.html', (req, res) => {
  if (!req.session.utente) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'public', 'modifica-svg.html'));
});

app.use(express.static('public'));
app.use('/eventi', express.static(path.join(__dirname, 'eventi')));

// ✅ Versione corretta per struttura reale della tabella `eventi`

app.post('/genera-pdf-e-invia', async (req, res) => {
  const nodemailer = require('nodemailer');
  const sharp = require('sharp');
  const QRCode = require('qrcode');
  const { jsPDF } = require('jspdf');

  try {
    const { evento, prenotatore, email, telefono, spettatori, totale } = req.body;
    if (!evento || !prenotatore || !email || !spettatori) {
      return res.status(400).json({ error: 'Dati mancanti' });
    }

    const eventFolder = path.join(__dirname, 'eventi', evento);
    const outputDir = path.join(eventFolder, 'PDF');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const { rows } = await pool.query('SELECT * FROM eventi WHERE slug = $1', [evento]);
    if (rows.length === 0) return res.status(404).json({ error: 'Evento non trovato' });
    
    await pool.query('BEGIN');

    const config = rows[0];
    const {
      nome: showName,
      data_spettacolo: showDate,
      ora: showTime,
      svg_file: svgFile,
      img_evento: imgEvento,
      intestazione: imgIntest = '',
      note_pdf: notespdf = ''
    } = config;

    const imgEventoUrl = `${baseUrl}/eventi/${evento}/${imgEvento}?t=${Date.now()}`;
    const bookingCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const pdfLinks = [];

// Controllo posti già occupati
for (const s of spettatori) {
  const check = await pool.query(
    'SELECT 1 FROM prenotazioni WHERE evento = $1 AND posto = $2',
    [evento, s.posto]
  );
  if (check.rows.length > 0) {
    await pool.query('ROLLBACK');
    return res.status(409).json({ error: `⚠️ Il posto ${s.posto} è già stato prenotato.` });
  }
}

    // Inserimento prenotazioni
    for (const s of spettatori) {
      await pool.query(`
        INSERT INTO prenotazioni (evento, posto, nome, email, telefono, prenotatore, booking_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [evento, s.posto, s.nome, email, telefono, prenotatore, bookingCode]
      );
    }

// 🔴 Dopo il salvataggio nel DB, emetti i posti prenotati via WebSocket
const postiPrenotati = spettatori.map(s => s.posto);
io.emit('posti-prenotati', { evento, posti: postiPrenotati });


    // Genera i PDF
    for (const s of spettatori) {
      const doc = new jsPDF();
      const imgEventoPath = path.join(eventFolder, imgEvento);
      const imgEventoBuffer = fs.readFileSync(imgEventoPath);
      const eventoImgOptimized = await sharp(imgEventoBuffer).resize({ width: 300 }).jpeg({ quality: 70 }).toBuffer();
      const eventoBase64 = `data:image/jpeg;base64,${eventoImgOptimized.toString('base64')}`;
      doc.addImage(eventoBase64, 'JPEG', 10, 10, 50, 30);

      const x = 10;
      let y = 50;

      const intestazione = (label, valore, colore = [0, 0, 0]) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`${label}:`, x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...colore);
        doc.text(valore, x + 35, y);
        y += 10;
      };

      intestazione('Spettacolo', showName);
const formattedDate = new Date(showDate).toLocaleDateString('it-IT');
intestazione('Data', formattedDate);
      intestazione('Posto', s.posto, [220, 38, 38]);
      intestazione('Spettatore', s.nome);
      intestazione('Prenotato da', `${prenotatore} (${email})`);
      intestazione('Prezzo', `€ ${parseFloat(s.prezzo).toFixed(2)}`);

      // Evidenzia il posto nello SVG
      const svgPath = path.join(eventFolder, 'svg', svgFile);
      let svgText = fs.readFileSync(svgPath, 'utf8');
      svgText = svgText.replace(
        new RegExp(`(<rect[^>]*?data-posto="${s.posto}"[^>]*?>)`, 'i'),
        (match) => {
          const x = match.match(/x="([^"]+)"/)?.[1];
          const y = match.match(/y="([^"]+)"/)?.[1];
          const width = match.match(/width="([^"]+)"/)?.[1];
          const height = match.match(/height="([^"]+)"/)?.[1];
          const rx = match.match(/rx="([^"]+)"/)?.[1];
          const ry = match.match(/ry="([^"]+)"/)?.[1];
          return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${ry}" fill="#0066ff" opacity="0.6"/>` + match;
        }
      );
      const imgBuffer = await sharp(Buffer.from(svgText), { density: 100 }).resize({ width: 450 }).png().toBuffer();
      const base64Image = imgBuffer.toString('base64');
      doc.addImage(`data:image/png;base64,${base64Image}`, 'PNG', x, y + 10, 120, 120);
      y += 135;

      if (notespdf) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        const righe = doc.splitTextToSize(notespdf, 180);
        doc.text(righe, x, y);
      }

      const codiceQR = JSON.stringify({
        codice: bookingCode,
        data: showDate,
        spettacolo: showName,
        posto: s.posto,
        spettatore: s.nome,
        cartella: evento,
        prenotatoDa: `${prenotatore} (${email})`
      });
      const qr = await QRCode.toDataURL(codiceQR);
      doc.addImage(qr, 'PNG', 150, 20, 40, 40);

      const safeName = s.nome.replace(/\s+/g, '_');
      const nomeFile = `${s.posto}_${safeName}.pdf`;
      const filePath = path.join(outputDir, nomeFile);
      fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));
      pdfLinks.push(`/eventi/${evento}/PDF/${nomeFile}`);
    }

    await pool.query('COMMIT');

    // Invia email
    const templatePath = path.join(eventFolder, 'email.html');
    let template = fs.readFileSync(templatePath, 'utf8');

    const [firstName, ...lastParts] = prenotatore.split(' ');
    const lastName = lastParts.join(' ');
    const pdfLinksHtml = spettatori.map(s => {
      const safeName = s.nome.trim().replace(/\s+/g, ' ');
      const label = `${s.posto} – ${safeName}`;
      const fileName = `${s.posto}_${s.nome.replace(/\s+/g, '_')}.pdf`;
      const fileUrl = `${baseUrl}/eventi/${evento}/PDF/${fileName}`;
      return `<a href="${fileUrl}" target="_blank" style="display:inline-block;background-color:#007BFF;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;margin:5px 0;font-family:sans-serif;font-size:14px;">${label}</a>`;
    }).join('<br>\n');

    const htmlEmail = template
      .replace(/{{img_intest}}/g, imgIntest)
      .replace(/{{img_evento}}/g, imgEventoUrl)
      .replace(/{{show_name}}/g, showName)
      .replace(/{{show_date}}/g, showDate)
      .replace(/{{nome}}/g, firstName)
      .replace(/{{cognome}}/g, lastName)
      .replace(/{{email}}/g, email)
      .replace(/{{telefono}}/g, telefono)
      .replace(/{{pdf_links}}/g, pdfLinksHtml)
      .replace(/{{total_amount}}/g, totale.toFixed(2))
      .replace(/{{notespdf}}/g, escapeHtml(notespdf))
      .replace(/{{booking_code}}/g, bookingCode);

    const transporter = nodemailer.createTransport({
      host: 'email-smtp.eu-central-1.amazonaws.com',
      port: 465,
      secure: true,
      auth: {
        user: 'AKIA4WFX5S42LKQTJ367',
        pass: 'BJ0gXwB2brrL/H0KIHC4dzgvl9WTb0NQ+jpjuHGXwV4t'
      }
    });

    await transporter.sendMail({
      from: '"Teatro La Calzamaglia" <info@lacalzamaglia.it>',
      to: email,
      subject: 'Conferma Prenotazione',
      html: htmlEmail
    });

    res.json({ success: true, pdfs: pdfLinks });

  } catch (err) {
    console.error('❌ Errore /genera-pdf-e-invia:', err);
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Errore interno del server' });
  }
});




// ✅ Verifica se i posti selezionati sono già occupati
app.post('/verifica-posti', async (req, res) => {
  const { evento, posti } = req.body;

  if (!evento || !Array.isArray(posti) || posti.length === 0) {
    return res.status(400).json({ ok: false, message: 'Dati mancanti o non validi' });
  }

  try {
    const placeholders = posti.map((_, i) => `$${i + 2}`).join(',');
    const values = [evento, ...posti];

    const result = await pool.query(
  `SELECT posto FROM prenotazioni WHERE evento = $1 AND posto IN (${placeholders})`,
  values
);

    if (result.rows.length > 0) {
      const giaOccupati = result.rows.map(r => r.posto);
      return res.json({ ok: false, giàOccupati: giaOccupati });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error("❌ Errore verifica-posti PostgreSQL:", err);
    return res.status(500).json({ ok: false, message: 'Errore del server' });
  }
});




// 1) Ritorna tutte le prenotazioni dal database
app.get('/resoconto', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM prenotazioni ORDER BY id`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Errore lettura prenotazioni PostgreSQL:', err);
    res.status(500).json({ error: 'Errore lettura prenotazioni' });
  }
});

// 2) Ritorna solo i posti occupati
app.get('/occupiedSeats', async (req, res) => {
  try {
    const result = await pool.query(`SELECT posto FROM prenotazioni`);
    const posti = result.rows.map(r => r.posto);
    res.json(posti);
  } catch (err) {
    console.error('❌ Errore PostgreSQL /occupiedSeats:', err);
    res.status(500).json({ error: 'Errore lettura posti occupati' });
  }
});

// 2bis) Ritorna solo i posti occupati di un evento specifico
app.get('/eventi/:evento/occupied-seats', async (req, res) => {
  const evento = req.params.evento;

  try {
    const result = await pool.query(
  `SELECT posto FROM prenotazioni WHERE evento = $1`,
  [evento]
);

    const posti = result.rows.map(r => r.posto);
    res.json(posti);

  } catch (err) {
    console.error('❌ Errore PostgreSQL /occupied-seats:', err);
    res.status(500).json({ error: 'Errore lettura posti occupati' });
  }
});

app.post('/elimina-prenotazione', async (req, res) => {
  const { evento, posto, nome } = req.body;

  if (!evento || !posto || !nome) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  const safeName = nome.replace(/\s+/g, '_');
  const filePath = path.join(__dirname, 'eventi', evento, 'PDF', `${posto}_${safeName}.pdf`);

  // 1) elimina il PDF
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error('❌ Errore eliminazione PDF:', e);
    }
  }

  try {
    // 2) elimina la prenotazione
    await pool.query(
      `DELETE FROM prenotazioni WHERE evento = $1 AND posto = $2 AND nome = $3`,
      [evento, posto, nome]
    );


    res.json({ success: true });

  } catch (err) {
    console.error('❌ Errore cancellazione prenotazione:', err);
    res.status(500).json({ error: 'Errore database' });
  }
});

//--- sidebar index.html


// Crea evento da dashboard
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
const fse = require('fs-extra');
const eventiDir = path.join(__dirname, 'eventi');
const templateDir = path.join(__dirname, 'template_prenotazione');

// Legge la configurazione dell'evento da PostgreSQL
async function getEventoConfig(slugEvento) {
  try {
    const result = await pool.query('SELECT * FROM eventi WHERE slug = $1', [slugEvento]);
    if (result.rows.length === 0) throw new Error('Evento non trovato');

    const row = result.rows[0];

    return {
      showName: row.nome,
      showDate: row.data_spettacolo,
      showTime: row.ora,
      imgEvento: row.img_evento,
      imgIntest: row.intestazione,
      notespdf: row.note_pdf,
      zonePrices: typeof row.zone_prices === 'string' ? JSON.parse(row.zone_prices) : row.zone_prices || {},
      numeroPostiTotali: row.numero_posti_totali || 0
    };
  } catch (err) {
    console.error('❌ Errore getEventoConfig (PostgreSQL):', err.message);
    throw err;
  }
}

// 🔁 Legge dal database SQLite con retry automatico se è bloccato (SQLITE_BUSY)
async function queryPostgres(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error('❌ Errore query PostgreSQL:', err.message);
    throw err;
  }
}

async function getConfigUtente(email) {
  try {
    const result = await pool.query(
      `SELECT * FROM configurazione WHERE email_utente = $1`,
      [email]
    );
    if (result.rows.length === 0) throw new Error('Utente non trovato');
    return result.rows[0];
  } catch (err) {
    console.error('❌ Errore in getConfigUtente:', err.message);
    throw err;
  }
}

//Gestione eventi in dashboard
app.get('/eventi-list', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM eventi ORDER BY data_spettacolo`);

    const listaEventi = rows.map(row => ({
      nome: row.nome || row.slug,
      folderName: row.slug,
      data: row.data_spettacolo || '',
      ora: row.ora || '',
      numeroPostiTotali: parseInt(row.numero_posti_totali || 0),
      imgIntest: row.intestazione || '',
      imgEvento: row.img_evento || '',
      zonePrices: row.zone_prices ? JSON.parse(row.zone_prices) : {}
    }));

    res.json(listaEventi);
  } catch (err) {
    console.error('❌ Errore lettura eventi da PostgreSQL:', err);
    res.status(500).json({ error: 'Errore lettura eventi' });
  }
});

// --- Prenotazioni di un evento completo ---
app.get('/eventi/:evento/prenotazioni', async (req, res) => {
  const evento = req.params.evento;

  try {
    const { rows } = await pool.query(
      `SELECT posto, nome, email, telefono, prenotatore, booking_code
       FROM prenotazioni
       WHERE evento = $1
       ORDER BY id`,
      [evento]
    );

    res.json(rows);
  } catch (err) {
    console.error('❌ Errore lettura prenotazioni PostgreSQL:', err);
    res.status(500).json({ error: 'Errore lettura prenotazioni' });
  }
});

// --- Elenco PDF disponibili per un evento ---
app.get('/eventi/:evento/pdf-list', (req, res) => {
  const evento = req.params.evento;
  const pdfDir = path.join(__dirname, 'eventi', evento, 'PDF');

  if (!fs.existsSync(pdfDir)) {
    return res.json([]); // Nessun PDF trovato
  }

  fs.readdir(pdfDir, (err, files) => {
    if (err) {
      console.error('Errore lettura PDF:', err);
      return res.json([]);
    }
    res.json(files); // Array di nomi file PDF
  });
});

app.get('/eventi/:evento/config', async (req, res) => {
  const { evento } = req.params;

  try {
    const { rows } = await pool.query('SELECT * FROM eventi WHERE slug = $1', [evento]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Evento non trovato nel database' });
    }

    const row = rows[0];

    const config = {
      showName: row.nome,
      showDate: row.data_spettacolo,
      showTime: row.ora,
      numeroPostiTotali: row.numero_posti_totali,
      imgIntest: row.intestazione || '',
      imgEvento: row.img_evento || '',
      svgFile: row.svg_file || '',
      notespdf: row.note_pdf || '',
      zonePrices: typeof row.zone_prices === 'string'
        ? JSON.parse(row.zone_prices)
        : row.zone_prices || {}
    };

    res.json(config);

  } catch (err) {
    console.error(`❌ Errore lettura config PostgreSQL per evento ${evento}:`, err);
    res.status(500).json({ error: 'Errore lettura config' });
  }
});

// --- Elimina intera cartella evento ---
app.post('/eventi/:evento/elimina', async (req, res) => {
  const evento = req.params.evento;
  const eventoPath = path.join(__dirname, 'eventi', evento);

  if (!fs.existsSync(eventoPath)) {
    return res.status(404).json({ error: 'Evento non trovato' });
  }

  // 🔒 Prende l'email dell'utente loggato dalla sessione
  const email_utente = req.session.utente?.email;

  if (!email_utente) {
    return res.status(403).json({ success: false, message: 'Utente non autenticato' });
  }

try {
  // 1. Elimina la cartella evento dal filesystem
  fse.removeSync(eventoPath);
  console.log(`✅ Evento "${evento}" eliminato da file system.`);

// 2. Elimina dal database PostgreSQL (tabella eventi)
const result = await pool.query(
  'DELETE FROM eventi WHERE slug = $1 AND email_utente = $2',
  [evento, email_utente]
);

  // 3. Elimina dalla tabella eventi (evento vero e proprio)
  await pool.query(
    'DELETE FROM eventi WHERE slug = $1 AND email_utente = $2',
    [evento, email_utente]
  );
  
  // 4. Elimina tutte le prenotazioni associate a questo evento
await pool.query(
  'DELETE FROM prenotazioni WHERE evento = $1',
  [evento]
);

  console.log(`🗃️ Evento "${evento}" eliminato anche dalla tabella eventi e eventi_utenti per ${email_utente}`);
  res.json({ success: true });

} catch (err) {
  console.error('❌ Errore eliminazione evento:', err);
  res.status(500).json({ error: 'Errore eliminazione evento' });
}
});
// --- Elimina singola prenotazione ---
app.post('/eventi/:evento/elimina-prenotazione', async (req, res) => {
  const evento = req.params.evento;
  const { posto, nome } = req.body;
  const pdfDir = path.join(__dirname, 'eventi', evento, 'PDF');

  if (!evento || !posto || !nome) {
    return res.status(400).json({ success: false, error: 'Dati mancanti' });
  }

  try {
    // 1. Elimina la prenotazione dalla tabella prenotazioni
    const res1 = await pool.query(
      `DELETE FROM prenotazioni WHERE evento = $1 AND posto = $2 AND nome = $3`,
      [evento, posto, nome]
    );

    // 2) elimina la prenotazione
await pool.query(
  `DELETE FROM prenotazioni WHERE evento = $1 AND posto = $2 AND nome = $3`,
  [evento, posto, nome]
);

    // 3. Elimina il PDF corrispondente
    if (fs.existsSync(pdfDir)) {
      const files = fs.readdirSync(pdfDir);
      files.forEach(file => {
        if (file.startsWith(`${posto}_`)) {
          try {
            fs.unlinkSync(path.join(pdfDir, file));
          } catch (e) {
            console.warn(`⚠️ Errore durante eliminazione PDF ${file}:`, e.message);
          }
        }
      });
    }

    console.log(`✅ Prenotazione per posto ${posto} eliminata da evento "${evento}".`);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ Errore eliminazione prenotazione PostgreSQL:', err);
    res.status(500).json({ success: false, error: 'Errore eliminazione' });
  }
});

app.post('/crea-evento', upload.fields([{ name: 'svg' }, { name: 'imgEvento' }]), async (req, res) => {
  try {
    const nome = req.body.nome.trim();
    const data = req.body.data;
    const ora = req.body.ora || '';
    const numeroPostiTotali = req.body.numeroPostiTotali;
    const files = req.files;
    const zonePrices = JSON.parse(req.body.zonePrices || '{}');

    if (!nome || !data || !files['svg']) {
      return res.status(400).json({ success: false, message: "Dati mancanti" });
    }

    const nomeSvg = files['svg'][0].originalname;
    const folder = `${data}_${slugify(nome)}`;
    const dir = path.join(eventiDir, folder);

    if (!fs.existsSync(eventiDir)) fs.mkdirSync(eventiDir);

// 1. Crea cartella evento
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 2. Copia template
await fse.copy(templateDir, dir);

// 3. Crea sottocartelle
const svgDir = path.join(dir, 'svg');
if (!fs.existsSync(svgDir)) {
  fs.mkdirSync(svgDir);
}

const imagesDir = path.join(dir, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// 4. Salva SVG
fs.renameSync(files['svg'][0].path, path.join(svgDir, nomeSvg));

// 5. Salva immagine spettacolo (se presente)
let imgEventoPath = '';
if (files['imgEvento']) {
  const imgOriginale = files['imgEvento'][0];
  const imgSavePath = path.join(imagesDir, 'spettacolo.png');
  fs.renameSync(imgOriginale.path, imgSavePath);
  imgEventoPath = 'images/spettacolo.png';
}

// 6. Recupera dati utente loggato
const utente = req.session.utente;
if (!utente || !utente.email) {
  return res.status(403).json({ success: false, message: 'Utente non autenticato' });
}

// 7. Prendi config utente da PostgreSQL
const configUtenteQuery = await pool.query(
  'SELECT img_intest, notespdf FROM configurazione WHERE email_utente = $1',
  [utente.email]
);
const configUtente = configUtenteQuery.rows[0] || {};

// 8. Crea cartella PDF
const pdfPath = path.join(dir, 'PDF');
if (!fs.existsSync(pdfPath)) {
  fs.mkdirSync(pdfPath);
}

// 9. Salva metadati dell’evento in PostgreSQL
await pool.query(`
  INSERT INTO eventi (
    slug, nome, data_spettacolo, ora, svg_file, img_evento,
    numero_posti_totali, zone_prices, intestazione, note_pdf, email_utente
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`, [
  folder,
  nome,
  data,
  ora,
  nomeSvg,
  imgEventoPath,
  numeroPostiTotali,
  JSON.stringify(zonePrices),
  configUtente.img_intest || '',
  configUtente.notespdf || '',
  utente.email
]);


console.log(`✅ Evento "${folder}" creato e salvato nel database PostgreSQL.`);
res.json({ success: true });

  } catch (err) {
    console.error("❌ Errore creazione evento:", err);
    res.status(500).json({ success: false, message: 'Errore interno server' });
  }
});


// ✅ Verifica QRCODE da app QR CODE READER
app.get('/verifica-codice', async (req, res) => {
  const codice = req.query.codice;
  const evento = req.query.evento;

  if (!codice || !evento) {
    return res.status(400).json({ valido: false });
  }

  try {
    const result = await pool.query(
      `SELECT nome, posto FROM prenotazioni WHERE booking_code = $1 AND evento = $2`,
      [codice, evento]
    );

    if (result.rows.length === 0) {
      return res.json({ valido: false });
    }

    const row = result.rows[0];
    return res.json({ valido: true, nome: row.nome, posto: row.posto });

  } catch (err) {
    console.error('❌ Errore /verifica-codice:', err);
    return res.status(500).json({ valido: false });
  }
});

// --- Verifica QRCODE con dati completi (via POST) ---
app.post('/verifica-codice-qr', async (req, res) => {
  try {
    const { codice, spettacolo, data, posto, spettatore, prenotatoDa, cartella } = req.body;

    if (!codice || !posto || !spettatore || !prenotatoDa || !cartella) {
      return res.status(400).json({ valido: false, motivo: 'Dati mancanti' });
    }

    const query = `
      SELECT * FROM prenotazioni 
      WHERE booking_code = $1 AND posto = $2 AND nome = $3 AND prenotatore = $4 AND evento = $5
    `;
    const values = [codice, posto, spettatore, prenotatoDa, cartella];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.json({ valido: false, motivo: 'Dati non corrispondenti' });
    }

    const row = result.rows[0];

    // Verifica se la data corrisponde a oggi
    const oggi = new Date().toISOString().slice(0, 10); // formato YYYY-MM-DD
    const queryEvento = `SELECT data_spettacolo FROM eventi WHERE slug = $1`;
    const evento = await pool.query(queryEvento, [cartella]);

    const dataSpettacolo = evento.rows?.[0]?.data_spettacolo?.toISOString()?.slice(0, 10);
    const dataCorrisponde = dataSpettacolo === oggi;

    return res.json({
      valido: true,
      giaControllato: false,  // da implementare in futuro se aggiungi un campo "controllato"
      dataCorrisponde,
      spettacolo,
      nome: row.nome,
      posto: row.posto
    });

  } catch (e) {
    console.error('❌ Errore verifica QR (PostgreSQL):', e);
    return res.status(500).json({ valido: false, motivo: 'Errore server' });
  }
});

// --- Modifica dati dell'evento (nome, data, svg, posti, prezzi)
app.post('/eventi/:evento/modifica', upload.fields([{ name: 'svg' }, { name: 'imgEvento' }]), async (req, res) => {
  try {
    const evento = req.params.evento;
    const dir = path.join(__dirname, 'eventi', evento);

    const files = req.files;
    const body = req.body;

    // --- Aggiorna i file SVG e immagine evento ---
    let svgFile = null;
    let imgEvento = null;

    if (files['svg']) {
      const svgPath = path.join(dir, 'svg', files['svg'][0].originalname);
      fs.renameSync(files['svg'][0].path, svgPath);
      svgFile = files['svg'][0].originalname;
    }

    if (files['imgEvento']) {
      const imgPath = path.join(dir, 'images', 'spettacolo.png');
      fs.renameSync(files['imgEvento'][0].path, imgPath);
      imgEvento = 'images/spettacolo.png';
    }

    // --- Costruzione della query UPDATE dinamica ---
    const queryParts = [];
    const values = [];
    let i = 1;

    const addField = (field, value) => {
      queryParts.push(`${field} = $${i}`);
      values.push(value);
      i++;
    };

    addField('nome', body.nome);
    addField('data_spettacolo', body.data);
    addField('ora', body.ora || '');
    addField('numero_posti_totali', body.numeroPostiTotali);
    addField('zone_prices', JSON.stringify(JSON.parse(body.zonePrices || '{}')));
    addField('intestazione', body.imgIntest || '');
    addField('note_pdf', body.notespdf || '');

    if (svgFile) addField('svg_file', svgFile);
    if (imgEvento) addField('img_evento', imgEvento);

    values.push(evento); // ultimo valore per WHERE
    const query = `UPDATE eventi SET ${queryParts.join(', ')} WHERE slug = $${i}`;

    await pool.query(query, values);

    console.log(`✏️ Evento "${evento}" aggiornato su PostgreSQL.`);
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Errore modifica evento:", err);
    res.status(500).json({ success: false, message: 'Errore interno server' });
  }
});

// ---- Sostituione immagine dello spettacolo
app.post('/eventi/:evento/modifica-immagine', upload.single('imgEvento'), async (req, res) => {
  const evento = req.params.evento;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'File mancante' });
  }

  const eventoDir = path.join(__dirname, 'eventi', evento);
  const imagesDir = path.join(eventoDir, 'images');
  const imgSavePath = path.join(imagesDir, 'spettacolo.png');

  try {
    // Salva l'immagine nella cartella
    fs.renameSync(file.path, imgSavePath);

    // Aggiorna il campo 'img_evento' nella tabella PostgreSQL
    const nuovoPercorso = 'images/spettacolo.png';
    await pool.query(
      `UPDATE eventi SET img_evento = $1 WHERE slug = $2`,
      [nuovoPercorso, evento]
    );

    console.log(`🖼️ Immagine spettacolo aggiornata per evento ${evento}`);
    res.json({ success: true });

  } catch (e) {
    console.error('❌ Errore salvataggio immagine:', e);
    res.status(500).json({ success: false, message: 'Errore durante aggiornamento' });
  }
});

/// --- login

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM configurazione WHERE email_utente = $1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }

    const utente = rows[0];

    // ✅ Verifica la password usando bcrypt
const isMatch = await bcrypt.compare(password, utente.password_utente);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }

    // Password corretta → salva sessione
    req.session.utente = {
      nome: utente.nome_utente,
      email: utente.email_utente
    };

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Errore login PostgreSQL:', err);
    res.status(500).json({ success: false, message: 'Errore server durante il login' });
  }
});

// 🔐 Middleware che blocca l'accesso se l'utente non è loggato
function requireLogin(req, res, next) {
  if (!req.session.utente) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }
  next(); // ✅ continua con la route successiva
}

// 🔍 Restituisce i dati configurazione dell'utente loggato
app.get('/config-utente', requireLogin, async (req, res) => {
  const emailUtente = req.session.utente?.email;

  if (!emailUtente) {
    return res.status(401).json({ success: false, error: 'Utente non autenticato' });
  }

  try {
    const result = await pool.query(
      `SELECT nome_utente, indirizzo_utente, email_utente, img_intest, notespdf
       FROM configurazione
       WHERE email_utente = $1`,
      [emailUtente]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utente non trovato' });
    }

    const config = result.rows[0];

    // Adatta i nomi alle aspettative di home.html
    res.json({
      nomeUtente: config.nome_utente,
      indirizzoUtente: config.indirizzo_utente,
      emailUtente: config.email_utente,
      imgIntest: config.img_intest,
      notespdf: config.notespdf
    });

  } catch (err) {
    console.error('❌ Errore /config-utente:', err);
    res.status(500).json({ success: false, error: 'Errore server' });
  }
});


//---pwd

app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email e password obbligatorie' });
  }

  try {
    // Controlla se esiste già un utente con questa email
    const result = await pool.query('SELECT 1 FROM configurazione WHERE email_utente = $1', [email]);
    if (result.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Questa email è già stata registrata' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Inserisci nuovo utente nella tabella PostgreSQL
    await pool.query(`
      INSERT INTO configurazione (email_utente, password_utente, nome_utente, indirizzo_utente, img_intest, notespdf)
      VALUES ($1, $2, '', '', '', '')
    `, [email, hash]);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Errore /register:', err);
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});


app.post('/modifica-password-email', async (req, res) => {
  const { email, nuovaPassword } = req.body;

  if (!email || !nuovaPassword) {
    return res.status(400).json({ success: false, message: 'Email e nuova password richieste' });
  }

  try {
    // Verifica se l'email esiste
    const result = await pool.query('SELECT 1 FROM utenti WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email non trovata' });
    }

    const hash = await bcrypt.hash(nuovaPassword, SALT_ROUNDS);

    // Aggiorna la password dell'utente
    await pool.query('UPDATE utenti SET password = $1 WHERE email = $2', [hash, email]);

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Errore /modifica-password-email:', err);
    res.status(500).json({ success: false, message: 'Errore server' });
  }
});



app.get('/lista-eventi', requireLogin, async (req, res) => {
  try {
    const email = req.session.utente.email;

    // Recupera tutti gli eventi associati all’utente
const { rows } = await pool.query(
  `SELECT slug AS nomeCartella, nome AS showName, data_spettacolo AS showDate, 
          ora AS showTime, svg_file AS svgFile, img_evento AS imgEvento, 
          intestazione AS imgIntest, note_pdf AS notespdf, numero_posti_totali, 
          zone_prices
   FROM eventi
   WHERE email_utente = $1`,
  [req.session.utente.email]
);

    // Formatto i risultati
const eventiCompleti = rows.map(row => ({
  nomeCartella: row.nomecartella,
  showName: row.showname || '',
  showDate: row.showdate || '',
  showTime: row.showtime || '',
  numeroPostiTotali: parseInt(row.numero_posti_totali || 0),
  svgFile: row.svgfile || '',
  imgEvento: row.imgevento || '',
  imgIntest: row.imgintest || '',
  notespdf: row.notespdf || '',
  zonePrices: row.zone_prices || {}
}));

    res.json({ success: true, eventi: eventiCompleti });

  } catch (err) {
    console.error('❌ Errore /lista-eventi PostgreSQL:', err);
    res.status(500).json({ success: false, eventi: [] });
  }
});

app.get('/home.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.get('/', (req, res) => {
  if (!req.session.utente) {
    return res.redirect('/login.html');
  }
  return res.redirect('/home.html');
});

// --- Avvio del server ---
const PORT = 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server WebSocket + Express avviato su http://localhost:${PORT}`);
});