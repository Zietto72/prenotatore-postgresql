const db = require('./db');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');
// Import template data from public folder
const config = require('./config/config.json');
const { showName, showDate, imgIntest, notespdf, emailJsUserId, apiUrl, zonePrices } = config;
const app = express();


// --- Nuovo endpoint: verifica esistenza PDF ---
// Va definito PRIMA di express.static per evitare che static restituisca 404
app.get('/api/pdf-exists/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'PDF', req.params.filename);
  res.json({ exists: fs.existsSync(filePath) });
});

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Rende accessibile il file di configurazione al browser
app.use('/config.json', express.static(path.join(__dirname, 'config/config.json')));

app.use(express.static('public'));
app.use('/eventi', express.static(path.join(__dirname, 'eventi')));



app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/eventi', express.static(path.join(__dirname, 'eventi')));

app.post('/genera-pdf-e-invia', async (req, res) => {
  try {
    const { prenotatore, email, telefono, spettatori, totale } = req.body;

    if (!prenotatore || !email || !spettatori) {
      return res.status(400).json({ error: 'Dati mancanti' });
    }

    // Genera un codice di prenotazione unico
    const bookingCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Output directory per i PDF
    const outputDir = path.join(__dirname, 'public', 'PDF');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const pdfLinks = [];
    // Generazione dei PDF per ciascun spettatore
    for (const s of spettatori) {
      const doc = new jsPDF();
      // Usa lo stesso codice per QR e email
      const codice = bookingCode;

      doc.setFontSize(12);
      doc.text(`Spettacolo: ${showName}`, 10, 30);
      doc.text(`Data: ${showDate}`, 10, 40);
      doc.text(`Posto: ${s.posto}`, 10, 50);
      doc.text(`Spettatore: ${s.nome}`, 10, 60);
      doc.text(`Prenotato da: ${prenotatore} (${email})`, 10, 70);
      doc.text(`Prezzo: € ${totale.toFixed(2)}`, 10, 80);

      try {
        const qr = await QRCode.toDataURL(codice);
        doc.addImage(qr, 'PNG', 150, 20, 40, 40);
      } catch (e) {
        console.error('QR generation failed:', e.message);
      }

      const safeName = s.nome.replace(/\s+/g, '_');
      const nomeFile = `${s.posto}_${safeName}.pdf`;
      const filePath = path.join(outputDir, nomeFile);
      fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));
      pdfLinks.push(`http://localhost:3000/PDF/${nomeFile}`);
    }

// — salva nel DB invece che nei JSON —
db.serialize(() => {
  // 1) dettagli in prenotazioni
  const stmtP = db.prepare(`
    INSERT INTO prenotazioni
      (posto, nome, email, telefono, prenotatore, bookingCode)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  spettatori.forEach(s => {
    stmtP.run(
      s.posto,
      s.nome,
      email,
      telefono,
      prenotatore,
      bookingCode
    );
  });
  stmtP.finalize();

  // 2) segnala i posti occupati
  const stmtO = db.prepare(`
    INSERT OR IGNORE INTO occupiedSeats (posto) VALUES (?)
  `);
  spettatori.forEach(s => stmtO.run(s.posto));
  stmtO.finalize();
});

    // Carica e compila il template email.html
    const templatePath = path.join(__dirname, 'email.html');
    let template = fs.readFileSync(templatePath, 'utf8');

    // Splitta prenotatore in nome e cognome
    const [firstName, ...lastParts] = prenotatore.split(' ');
    const lastName = lastParts.join(' ');

const pdfLinksHtml = spettatori.map((s, index) => {
  const safeName = s.nome.trim().replace(/\s+/g, ' ');
  const label = `${s.posto} – ${safeName}`;
  const fileName = `${s.posto}_${s.nome.replace(/\s+/g, '_')}.pdf`;
  const fileUrl = `http://localhost:3000/PDF/${fileName}`;
  return `
    <a href="${fileUrl}" target="_blank" style="
      display: inline-block;
      background-color: #007BFF;
      color: white;
      padding: 10px 16px;
      text-decoration: none;
      border-radius: 6px;
      margin: 5px 0;
      font-family: sans-serif;
      font-size: 14px;
    ">${label}</a>`;
}).join('<br>\n');

    // Sostituisci i placeholder nel template
    const htmlEmail = template
      .replace(/{{img_intest}}/g, imgIntest)
      .replace(/{{show_name}}/g, showName)
      .replace(/{{show_date}}/g, showDate)
      .replace(/{{nome}}/g, firstName)
      .replace(/{{cognome}}/g, lastName)
      .replace(/{{email}}/g, email)
      .replace(/{{telefono}}/g, telefono)
      .replace(/{{pdf_links}}/g, pdfLinksHtml)
      .replace(/{{total_amount}}/g, totale.toFixed(2))
      .replace(/{{booking_code}}/g, bookingCode);

    // Configura Nodemailer
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'email-smtp.eu-central-1.amazonaws.com',
      port: 465,
      secure: true,
      auth: {
        user: 'AKIA4WFX5S42LKQTJ367',
        pass: 'BJ0gXwB2brrL/H0KIHC4dzgvl9WTb0NQ+jpjuHGXwV4t'
      }
    });

    const mailOptions = {
      from: '"Teatro La Calzamaglia" <info@lacalzamaglia.it>',
      to: email,
      subject: 'Conferma Prenotazione',
      html: htmlEmail
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Errore invio email:', error);
      } else {
        console.log('✅ Email inviata:', info.messageId);
      }
    });

    return res.json({ success: true, pdfs: pdfLinks });
  } catch (err) {
    console.error('Errore server:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Parametri per resconto.html

// 1) Ritorna tutte le prenotazioni dal database
app.get('/resoconto', (req, res) => {
  db.all(
    `SELECT * FROM prenotazioni ORDER BY id`,
    (err, rows) => {
      if (err) {
        console.error('Errore lettura prenotazioni dal DB:', err);
        return res.status(500).json({ error: err.message });
      }
      // rows è un array di oggetti: 
      //  [{ id:1, posto:'A1', nome:'Mario Rossi', … }, { … }, …]
      res.json(rows);
    }
  );
});

// 2) Ritorna solo i posti occupati
app.get('/occupiedSeats', (req, res) => {
  db.all(
    `SELECT posto FROM occupiedSeats`,
    (err, rows) => {
      if (err) {
        console.error('Errore lettura occupiedSeats dal DB:', err);
        return res.status(500).json({ error: err.message });
      }
      // rows è es. [ { posto: 'A1' }, { posto: 'B3' }, … ]
      // Mappiamo solo il valore della colonna
      const posti = rows.map(r => r.posto);
      res.json(posti);
    }
  );
});

// Elimina le prenotazioni tramite resoconto.html
app.post('/elimina-prenotazione', (req, res) => {
  const { posto, nome } = req.body;
  const safeName = nome.replace(/\s+/g, '_');
  const filePath = path.join(__dirname, 'public', 'PDF', `${posto}_${safeName}.pdf`);

  // 1) elimina il PDF
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); }
    catch (e) { console.error('❌ Errore eliminazione PDF:', e); }
  }

  // 2) elimina la prenotazione dal DB
  db.run(
    `DELETE FROM prenotazioni WHERE posto = ? AND nome = ?`,
    [posto, nome],
    (err1) => {
      if (err1) {
        console.error('❌ Errore cancellazione prenotazione DB:', err1);
        return res.status(500).json({ error: 'Errore DB prenotazioni' });
      }
      // 3) elimina il posto da occupiedSeats
      db.run(
        `DELETE FROM occupiedSeats WHERE posto = ?`,
        [posto],
        (err2) => {
          if (err2) {
            console.error('❌ Errore cancellazione occupiedSeats DB:', err2);
            return res.status(500).json({ error: 'Errore DB occupiedSeats' });
          }
          // Tutto ok
          res.json({ success: true });
        }
      );
    }
  );
});

// Crea evento
// Aggiungi questo blocco a server.js

const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
const eventiDir = path.join(__dirname, 'eventi');

// 1. Lista eventi
app.get('/lista-eventi', (req, res) => {
  if (!fs.existsSync(eventiDir)) return res.json([]);
  const cartelle = fs.readdirSync(eventiDir).filter(name => fs.lstatSync(path.join(eventiDir, name)).isDirectory());
  const eventi = cartelle.map(nome => {
    const infoPath = path.join(eventiDir, nome, 'info.json');
    let data = '?';
    if (fs.existsSync(infoPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(infoPath));
        data = content.data || '?';
      } catch (e) {}
    }
    return { nome: nome.replace(/_/g, ' '), folder: nome, data };
  });
  res.json(eventi);
});

// 2. Crea evento
app.post('/crea-evento', upload.single('svg'), (req, res) => {
  const nome = req.body.nome.trim();
  const data = req.body.data;
  const file = req.file;

  if (!nome || !data || !file) return res.status(400).json({ success: false });

  const folder = nome.replace(/\s+/g, '_');
  const dir = path.join(eventiDir, folder);
  if (!fs.existsSync(eventiDir)) fs.mkdirSync(eventiDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  if (!fs.existsSync(path.join(dir, 'PDF'))) fs.mkdirSync(path.join(dir, 'PDF'));

  fs.renameSync(file.path, path.join(dir, 'svg.svg'));
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ nome, data }, null, 2));
  fs.writeFileSync(path.join(dir, 'occupiedSeats.json'), '[]');
  fs.writeFileSync(path.join(dir, 'prenotazioni.json'), '[]');

  res.json({ success: true });
});

// 3. Elimina evento
app.delete('/elimina-evento/:folder', (req, res) => {
  const dir = path.join(eventiDir, req.params.folder);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});


const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server avviato su http://localhost:${PORT}`));
