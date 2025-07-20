
document.addEventListener('DOMContentLoaded', () => {
  emailjs.init('9nC5KQZEzQXSDJdfv');

  const selectedSeatsEl = document.getElementById('selectedSeats');
  const totalAmountModalEl = document.getElementById('totalAmountModal');
  const bookButton = document.getElementById('bookButton');
  let selectedSeats = [];
  let prenotatoreData = {};
  let seatDetails = [];

  function aggiornaPostiSVG() {
    selectedSeatsEl.textContent = selectedSeats.length;
    totalAmountModalEl.textContent = (selectedSeats.length * 7.5).toFixed(2);
    bookButton.disabled = selectedSeats.length === 0;
  }

  document.getElementById('bookButton').addEventListener('click', () => {
    document.getElementById('prenotatoreModal').style.display = 'block';
  });

  window.controllaPrenotatore = function () {
    prenotatoreData.nome = document.getElementById('prenotatoreNome').value;
    prenotatoreData.email = document.getElementById('prenotatoreEmail').value;
    prenotatoreData.telefono = document.getElementById('prenotatoreTelefono').value;

    if (prenotatoreData.nome && prenotatoreData.email && prenotatoreData.telefono) {
      document.getElementById('prenotatoreModal').style.display = 'none';
      mostraInputSpettatori();
    } else {
      alert('Compila tutti i campi.');
    }
  };

  function mostraInputSpettatori() {
    const container = document.getElementById('spettatoriInput');
    container.innerHTML = '';
    selectedSeats.forEach(seat => {
      container.innerHTML += `<label>Posto ${seat.label}:</label><input type="text" id="spettatore-${seat.id}" required>`;
    });
    document.getElementById('spettatoriModal').style.display = 'block';
  }

  window.apriRiepilogo = function () {
    const contenuto = selectedSeats.map(seat => {
      const nome = document.getElementById('spettatore-' + seat.id).value;
      return `${seat.label}: ${nome}`;
    }).join('<br>');

    document.getElementById('riepilogoContenuto').innerHTML = `
      <b>Prenotatore:</b> ${prenotatoreData.nome}<br>
      <b>Email:</b> ${prenotatoreData.email}<br>
      <b>Telefono:</b> ${prenotatoreData.telefono}<br><br>
      <b>Spettatori:</b><br>${contenuto}`;
    document.getElementById('spettatoriModal').style.display = 'none';
    document.getElementById('riepilogoModal').style.display = 'block';
  };

  window.procediPagamento = function () {
    const bookingCode = Math.random().toString(36).substring(2, 8);
    seatDetails = selectedSeats.map(seat => ({
      number: seat.label,
      nome: document.getElementById('spettatore-' + seat.id).value,
      email: prenotatoreData.email,
      telefono: prenotatoreData.telefono,
      bookingCode
    }));

    fetch('/generate-pdf', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        seatDetails,
        showName: "Mia Magna la Barunessa",
        showDate: "Sabato 12 Marzo 2024",
        seatPrice: 7.5,
        imgIntest: "http://www.lacalzamaglia.it/wp-content/uploads/2024/06/logo-calza.png",
        notespdf: "Questo documento non ha valore fiscale..."
      })
    })
    .then(res => res.json())
    .then(result => {
      if (result.pdfPaths && result.pdfPaths.length > 0) {
        emailjs.send('service_5dbyknu', 'template_c0sb6pt', {
          nome: prenotatoreData.nome.split(' ')[0],
          cognome: prenotatoreData.nome.split(' ')[1] || '',
          email: prenotatoreData.email,
          telefono: prenotatoreData.telefono,
          show_name: "Mia Magna la Barunessa",
          show_date: "Sabato 12 Marzo 2024",
          seat_details: seatDetails.map(s => `${s.number}: ${s.nome}`).join('\n'),
          total_amount: selectedSeats.length * 7.5,
          booking_code: bookingCode,
          pdf_link: window.location.origin + result.pdfPaths[0]
        }).then(() => {
          alert('PDF generato ed email inviata!');
          location.reload();
        }).catch(err => {
          alert("Errore invio email: " + err.message);
        });
      }
    });
  };

  // Carica inline l'SVG della piantina
  fetch('svg/piantina.svg')
    .then(res => res.text())
    .then(svg => {
      document.getElementById('svgContainer').innerHTML = svg;

      document.querySelectorAll('svg rect.posto').forEach(rect => {
        const gruppo = rect.closest('g');
        const textEl = gruppo.querySelector('text');
        const labelText = textEl?.textContent?.trim() || gruppo.id;

        rect.addEventListener('click', () => {
          const index = selectedSeats.findIndex(s => s.id === gruppo.id);
          if (index !== -1) {
            selectedSeats.splice(index, 1);
            gruppo.classList.remove('selezionato');
            rect.setAttribute('fill', rect.getAttribute('data-original-color') || '');
          } else {
            selectedSeats.push({ id: gruppo.id, label: labelText });
            gruppo.classList.add('selezionato');
            rect.setAttribute('data-original-color', rect.getAttribute('fill'));
            rect.setAttribute('fill', '#6c7ae0');
          }
          aggiornaPostiSVG();
        });
      });
    });
});
