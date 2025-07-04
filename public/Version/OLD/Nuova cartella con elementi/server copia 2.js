
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');
const emailjs = require('@emailjs/nodejs');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

app.post('/genera-pdf-e-invia', async (req, res) => {
  const { prenotatore, email, telefono, spettatori, totale } = req.body;

  if (!prenotatore || !email || !spettatori) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  const outputDir = path.join(__dirname, 'public', 'PDF');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const pdfLinks = [];

  for (const s of spettatori) {
    const doc = new jsPDF();
    const codice = Math.random().toString(36).substring(2, 10).toUpperCase();

    doc.setFontSize(12);
    doc.text(`Spettacolo: Mia Magna la Barunessa`, 10, 30);
    doc.text(`Data: Sabato 12 Marzo 2024`, 10, 40);
    doc.text(`Posto: ${s.posto}`, 10, 50);
    doc.text(`Spettatore: ${s.nome}`, 10, 60);
    doc.text(`Prenotato da: ${prenotatore} (${email})`, 10, 70);
    doc.text(`Prezzo: € 7.50`, 10, 80);

    try {
      const qr = await QRCode.toDataURL(codice);
      doc.addImage(qr, 'PNG', 150, 20, 40, 40);
    } catch (e) {
      console.log("QR fallito:", e.message);
    }

    const nomeFile = `${s.nome.replace(/\s+/g, "_")}_${s.posto}_${codice}.pdf`;
    const filePath = path.join(outputDir, nomeFile);
    fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));
    pdfLinks.push(`http://localhost:3000/PDF/${nomeFile}`);
  }

  try {
    await emailjs.send('service_5dbyknu', 'template_c0sb6pt', {
      to_name: prenotatore,
      to_email: email,
      message: `Grazie per la tua prenotazione! Ecco i tuoi biglietti:<br><br>${pdfLinks.join('<br>')}`
    }, {
  publicKey: '7t6PwNH663O0pMy9S',
  privateKey: 'LGJa5TEFaP9lvxj8BH1Ct'    });

    res.json({ success: true, pdfs: pdfLinks });
  } catch (err) {
    console.error("Errore invio email:", err);
    res.status(500).json({ error: "Email non inviata" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server avviato su http://localhost:${PORT}`));
