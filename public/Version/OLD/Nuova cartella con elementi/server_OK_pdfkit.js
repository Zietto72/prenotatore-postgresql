
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/generate-pdf', (req, res) => {
    const { seatDetails, showName, showDate, seatPrice, imgIntest, notespdf } = req.body;
    const pdfDirectory = path.join(__dirname, 'public', 'PDF');
    if (!fs.existsSync(pdfDirectory)) fs.mkdirSync(pdfDirectory, { recursive: true });

    const pdfPaths = [];
    let completed = 0;

    seatDetails.forEach((seat, index) => {
        const doc = new PDFDocument();
        const safeSeatName = (seat.nome || 'Spettatore').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${safeSeatName}_${seat.number}_${seat.bookingCode}.pdf`;
        const pdfPath = path.join(pdfDirectory, fileName);

        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        doc.fontSize(16).text(`Prenotazione: ${showName}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Data: ${showDate}`);
        doc.text(`Posto: ${seat.number}`);
        doc.text(`Nome: ${seat.nome}`);
        doc.text(`Email: ${seat.email}`);
        doc.text(`Telefono: ${seat.telefono}`);
        doc.text(`Codice Prenotazione: ${seat.bookingCode}`);
        doc.text(`Prezzo: € ${seatPrice.toFixed(2)}`);
        doc.moveDown();
        doc.fontSize(10).text(notespdf || '', { align: 'left' });

        doc.end();

        writeStream.on('finish', () => {
            pdfPaths.push(`/PDF/${fileName}`);
            completed++;
            if (completed === seatDetails.length) {
                console.log('PDF generati:', pdfPaths);
                res.status(200).json({ message: 'PDF generati e salvati con successo.', pdfPaths });
            }
        });

        writeStream.on('error', (error) => {
            console.error('Errore durante la scrittura del PDF:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Errore durante la scrittura del PDF.' });
            }
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server in ascolto su http://localhost:${PORT}`);
});
