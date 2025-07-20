
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/generate-pdf', async (req, res) => {
    const { seatDetails, showName, showDate, seatPrice, imgIntest, notespdf } = req.body;
    const pdfDirectory = path.join(__dirname, 'public', 'PDF');
    if (!fs.existsSync(pdfDirectory)) fs.mkdirSync(pdfDirectory, { recursive: true });

    const pdfPaths = [];
    let completed = 0;

    for (const seat of seatDetails) {
        const doc = new PDFDocument({ size: 'A6', layout: 'landscape', margin: 20 });
        const safeSeatName = (seat.nome || 'Spettatore').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${safeSeatName}_${seat.number}_${seat.bookingCode}.pdf`;
        const pdfPath = path.join(pdfDirectory, fileName);

        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        // Intestazione con logo (se presente)
        if (imgIntest) {
            try {
                doc.image(imgIntest, doc.page.width - 80, 10, { width: 60 });
            } catch (err) {
                console.warn('Logo non caricato:', err.message);
            }
        }

        doc.fontSize(18).text('BIGLIETTO', 20, 20);
        doc.moveDown();

        doc.fontSize(12);
        doc.text(`Spettacolo: ${showName}`);
        doc.text(`Data: ${showDate}`);
        doc.text(`Posto: ${seat.number}`);
        doc.text(`Spettatore: ${seat.nome}`);
        doc.text(`Telefono: ${seat.telefono}`);
        doc.text(`Email: ${seat.email}`);
        doc.text(`Prezzo: € ${seatPrice.toFixed(2)}`);
        doc.text(`Codice Prenotazione: ${seat.bookingCode}`);

        // QR Code
        const qrContent = `Prenotazione: ${seat.bookingCode}\n${seat.nome}\nPosto: ${seat.number}`;
        const qrImagePath = path.join(__dirname, 'public', 'PDF', `${seat.bookingCode}_qr.png`);

        await QRCode.toFile(qrImagePath, qrContent, { width: 200 });

        doc.image(qrImagePath, doc.page.width - 130, doc.page.height - 100, { width: 100 });

        doc.moveDown();
        doc.fontSize(8).text(notespdf || '', { align: 'left' });

        doc.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                pdfPaths.push(`/PDF/${fileName}`);
                fs.unlink(qrImagePath, () => resolve()); // rimuove QR temporaneo
            });
            writeStream.on('error', reject);
        });
    }

    console.log('PDF generati:', pdfPaths);
    res.status(200).json({ message: 'PDF generati in stile biglietto.', pdfPaths });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server in ascolto su http://localhost:${PORT}`);
});
