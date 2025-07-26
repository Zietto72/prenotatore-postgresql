// 📄 pdfGenerator.js con p-limit
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');
const pLimit = require('p-limit');

module.exports = async function generaPDF({
  evento,
  spettatori,
  eventFolder,
  outputDir,
  svgFile,
  imgEvento,
  imgIntest,
  showName,
  showDate,
  prenotatore,
  email,
  notespdf,
  bookingCode
}) {
  const pdfLinks = [];
  const limit = pLimit(8); // ⏱️ Limita a 4 generazioni in parallelo

  const svgPath = path.join(eventFolder, 'svg', svgFile);
  const svgTextOriginale = fs.readFileSync(svgPath, 'utf8');

  const imgEventoPath = path.join(eventFolder, imgEvento);
  const imgEventoBuffer = fs.readFileSync(imgEventoPath);
  const eventoBase64 = `data:image/jpeg;base64,${(await sharp(imgEventoBuffer)
    .resize({ width: 300 })
    .jpeg({ quality: 70 })
    .toBuffer()).toString('base64')}`;

  await Promise.all(spettatori.map(s =>
    limit(async () => {
      const safeName = s.nome.trim().replace(/\s+/g, '_');
      const nomeFile = `${s.posto}_${safeName}.pdf`;
      const filePath = path.join(outputDir, nomeFile);

      if (fs.existsSync(filePath)) {
        pdfLinks.push(`/eventi/${evento}/PDF/${nomeFile}`);
        return;
      }

      const doc = new jsPDF();
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

      let svgText = svgTextOriginale.replace(
        new RegExp(`(<rect[^>]*?data-posto="${s.posto}"[^>]*?>)`, 'i'),
        (match) => {
          const x = match.match(/x="([^"]+)"/)?.[1];
          const y = match.match(/y="([^"]+)"/)?.[1];
          const width = match.match(/width="([^"]+)"/)?.[1];
          const height = match.match(/height="([^"]+)"/)?.[1];
          const rx = match.match(/rx="([^"]+)"/)?.[1] || 0;
          const ry = match.match(/ry="([^"]+)"/)?.[1] || 0;
          return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${ry}" fill="#0066ff" opacity="0.6"/>` + match;
        }
      );

      const imgBuffer = await sharp(Buffer.from(svgText), { density: 72 })
        .resize({ width: 450 })
        .png()
        .toBuffer();

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

      fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));
      pdfLinks.push(`/eventi/${evento}/PDF/${nomeFile}`);
    })
  ));

  return pdfLinks;
};