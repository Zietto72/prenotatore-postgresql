
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

app.post('/generate-pdf', async (req, res) => {
  const { seatDetails, config } = req.body;

  if (!seatDetails || !config) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  const outputDir = path.join(__dirname, 'public', 'PDF');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const generatedPDFs = [];

  for (const seat of seatDetails) {
    const doc = new jsPDF();
    const codicePrenotazione = seat.bookingCode || Math.random().toString(36).substr(2, 8).toUpperCase();

    // Logo
    try {
      const logoImg = await fetchImageAsBase64(config.logo);
      doc.addImage(logoImg, 'PNG', 10, 10, 40, 20);
    } catch (err) {
      console.log("Logo non caricato:", err.message);
    }

    // Testo
    doc.setFontSize(12);
    doc.text(`Spettacolo: ${config.nome}`, 10, 40);
    doc.text(`Data: ${config.data}`, 10, 50);
    doc.text(`Posto: ${seat.number}`, 10, 60);
    doc.text(`Spettatore: ${seat.nome}`, 10, 70);
    doc.text(`Prenotato da: ${seat.email} (${seat.telefono})`, 10, 80);
    doc.text(`Prezzo: € ${config.prezzo.toFixed(2)}`, 10, 90);

    // QR code
    try {
      const qrDataUrl = await QRCode.toDataURL(codicePrenotazione);
      doc.addImage(qrDataUrl, 'PNG', 150, 20, 40, 40);
    } catch (err) {
      console.log("QR Code non generato:", err.message);
    }

    // Note finali
    doc.setFontSize(10);
    doc.text(config.note || 'Documento non valido ai fini fiscali.', 10, 110);

    const fileName = `${seat.nome.replace(/\s+/g, "_")}_${seat.number}_${codicePrenotazione}.pdf`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));

    generatedPDFs.push(`/PDF/${fileName}`);
  }

  res.json({ pdfPaths: generatedPDFs });
});

async function fetchImageAsBase64(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const mimeType = res.headers['content-type'] || 'image/png';
        resolve(`data:${mimeType};base64,${base64}`);
      });
    }).on('error', reject);
  });
}

const PORT = 3000;
app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
