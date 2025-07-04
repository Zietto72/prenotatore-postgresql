const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');
// Import template data from public folder
const { showName, showDate, imgIntest } = require('./public/setup.js');

const app = express();
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

    // Aggiorna occupiedSeats.json
    const occupiedPath = path.join(__dirname, 'public', 'occupiedSeats.json');
    let occupiedSeats = [];
    if (fs.existsSync(occupiedPath)) {
      try {
        occupiedSeats = JSON.parse(fs.readFileSync(occupiedPath));
      } catch (e) {
        console.error('Errore lettura occupiedSeats.json:', e);
      }
    }
    for (const s of spettatori) {
      if (!occupiedSeats.includes(s.posto)) {
        occupiedSeats.push(s.posto);
      }
    }
    fs.writeFileSync(occupiedPath, JSON.stringify(occupiedSeats, null, 2));
    
    // --- Salva le prenotazioni in prenotazioni.json ---
const prenotazioniPath = path.join(__dirname, 'public', 'prenotazioni.json');
let prenotazioni = [];

if (fs.existsSync(prenotazioniPath)) {
  try {
    prenotazioni = JSON.parse(fs.readFileSync(prenotazioniPath));
  } catch (e) {
    console.error('Errore lettura prenotazioni.json:', e);
  }
}

spettatori.forEach(s => {
  prenotazioni.push({
    posto: s.posto,
    nome: s.nome,
    email,
    telefono,
    prenotatore,
    bookingCode
  });
});

try {
  fs.writeFileSync(prenotazioniPath, JSON.stringify(prenotazioni, null, 2));
  console.log('✅ prenotazioni.json aggiornato');
} catch (e) {
  console.error('❌ Errore nel salvataggio di prenotazioni.json:', e);
}

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

app.get('/resoconto', (req, res) => {
  const prenotazioniPath = path.join(__dirname, 'public', 'prenotazioni.json');
  if (!fs.existsSync(prenotazioniPath)) return res.json([]);

  try {
    const data = fs.readFileSync(prenotazioniPath);
    const json = JSON.parse(data);
    return res.json(json);
  } catch (err) {
    console.error('Errore lettura resoconto:', err);
    return res.status(500).json({ error: 'Errore nel recupero dei dati' });
  }
});

// Elimina le prenotazioni tramite resoconto.html
app.post('/elimina-prenotazione', (req, res) => {
  const { posto, nome } = req.body;

  const prenotazioniPath = path.join(__dirname, 'public', 'prenotazioni.json');
  const occupiedPath = path.join(__dirname, 'public', 'occupiedSeats.json');
  const pdfDir = path.join(__dirname, 'public', 'PDF');
  const fileName = `${posto}_${nome.replace(/\s+/g, '_')}.pdf`;
  const filePath = path.join(pdfDir, fileName);

  // 1. Elimina dal file PDF
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('❌ Errore eliminazione PDF:', e);
  }

  // 2. Rimuove dal file prenotazioni
  let prenotazioni = [];
  if (fs.existsSync(prenotazioniPath)) {
    prenotazioni = JSON.parse(fs.readFileSync(prenotazioniPath));
    prenotazioni = prenotazioni.filter(p => !(p.posto === posto && p.nome === nome));
    fs.writeFileSync(prenotazioniPath, JSON.stringify(prenotazioni, null, 2));
  }

  // 3. Rimuove dal file occupiedSeats
  let occupied = [];
  if (fs.existsSync(occupiedPath)) {
    occupied = JSON.parse(fs.readFileSync(occupiedPath));
    occupied = occupied.filter(p => p !== posto);
    fs.writeFileSync(occupiedPath, JSON.stringify(occupied, null, 2));
  }

  res.json({ success: true });
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
