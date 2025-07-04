fetch('occupiedSeats.json')
  .then(res => res.json())
  .then(occupied => {
    occupied.forEach(posto => {
      const seatEl = document.querySelector(`[data-posto="${posto}"]`);
      if (seatEl) {
        seatEl.classList.add('occupied'); // stile da definire nel CSS
      }
    });
  })
  .catch(err => {
    console.warn("Impossibile caricare i posti occupati:", err);
  });


// Insieme per i posti selezionati
const selected = new Set();

// Seleziona tutti gli elementi SVG con classe .posto
const svg = document.querySelector("svg");

svg.querySelectorAll('.posto').forEach(posto => {
  posto.addEventListener("click", e => {
    const g = posto.closest("g");
    const id = g?.id;

    if (!id) return;

    if (selected.has(id)) {
      selected.delete(id);
      g.classList.remove("selected");
    } else {
      if (selected.size >= 8) {
        alert("Puoi prenotare al massimo 8 posti per volta.");
        return;
      }
      selected.add(id);
      g.classList.add("selected");
    }

    aggiornaBottoneConferma();
  });
});

// Mostra/nasconde il bottone 'Conferma'
function aggiornaBottoneConferma() {
  const conferma = document.getElementById("confermaPrenotazione");
  if (!conferma) return;
  conferma.style.display = selected.size > 0 ? "block" : "none";
}

// Apre la modale per inserire i dati del prenotatore
window.controllaPrenotatore = () => {
  const nome = document.getElementById('prenotatoreNome').value.trim();
  const email = document.getElementById('prenotatoreEmail').value.trim();
  const telefono = document.getElementById('prenotatoreTelefono').value.trim();

  if (!nome || !email || !telefono) {
    alert("Compila tutti i campi");
    return;
  }

  window.prenotatoreData = { nome, email, telefono };

  const container = document.getElementById('spettatoriInput');
  container.innerHTML = '';

  Array.from(selected).forEach(id => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.setAttribute('for', `spettatore-${id}`);
    label.textContent = `Spettatore per posto ${id}`;

    const input = document.createElement('input');
    input.id = `spettatore-${id}`;
    input.placeholder = 'Nome e Cognome';
    input.required = true;
    input.type = 'text';

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
  });

  document.getElementById('prenotatoreModal').style.display = 'none';
  document.getElementById('spettatoriModal').style.display = 'block';
};

// Chiude tutte le modali
function chiudiModale() {
  document.querySelectorAll('.modal').forEach(modale => {
    modale.style.display = 'none';
  });
}

function inviaEmailConferma(datiPrenotazione) {
  fetch('http://localhost:3000/genera-pdf-e-invia', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(datiPrenotazione)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const seatDetails = datiPrenotazione.spettatori
        .map(s => `Posto ${s.posto}: ${s.nome}`)
        .join('\n');

      const pdfLinks = data.pdfs.map((link, index) => {
        const spettatore = datiPrenotazione.spettatori[index];
        return `<a href="${link}" target="_blank">📄 PDF Posto ${spettatore.posto} – ${spettatore.nome}</a>`;
      }).join('<br>');

      const nomeCompleto = datiPrenotazione.prenotatore.trim().split(' ');
      const nome = nomeCompleto.slice(0, -1).join(' ') || datiPrenotazione.prenotatore;
      const cognome = nomeCompleto.slice(-1).join(' ') || '';

      emailjs.send('service_5dbyknu', 'template_c0sb6pt', {
        img_intest: 'http://www.lacalzamaglia.it/wp-content/uploads/2024/06/logo-calza.png',
        show_name: 'Mia Magna la Barunessa',
        show_date: 'Sabato 12 Marzo 2024',
        nome: nome,
        cognome: cognome,
        email: datiPrenotazione.email,
        telefono: datiPrenotazione.telefono,
        seat_details: seatDetails,
        pdf_links: pdfLinks,
        total_amount: datiPrenotazione.totale.toFixed(2),
        booking_code: Math.random().toString(36).substring(2, 8).toUpperCase()
      }, 'wgOAHSNswOPXrUPY7')
      .then(function(response) {
        // ✅ Chiudi la modale
        const modal = document.getElementById("riepilogoModal");
        if (modal) modal.style.display = "none";

const msg = document.getElementById("messaggioConferma");
if (msg) {
  msg.style.display = "block";
}
      }, function(error) {
        console.error("Errore nell'invio dell'email:", error);
        alert("Errore durante l'invio della prenotazione.");
      });
    } else {
      alert("Errore nella generazione del PDF.");
    }
  })
  .catch(error => {
    console.error("Errore chiamata backend:", error);
    alert("Errore nella richiesta al server.");
  });
}

function chiudiMessaggioConferma() {
  const msg = document.getElementById("messaggioConferma");
  if (msg) {
    msg.style.display = "none";
    window.location.reload(); // 🔁 aggiorna la pagina
  }
}