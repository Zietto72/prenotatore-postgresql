// Carica posti occupati al caricamento
fetch('occupiedSeats.json')
  .then(res => res.json())
  .then(occupied => {
    occupied.forEach(posto => {
      const seatEl = document.querySelector(`[data-posto="${posto}"]`);
      if (seatEl) {
        seatEl.classList.add('occupied');
      }
    });
  })
  .catch(err => {
    console.warn("Impossibile caricare i posti occupati:", err);
  });


// Carica posti occupati (resta identico)
fetch('occupiedSeats.json')
  .then(r => r.json())
  .then(occupied => {
    occupied.forEach(id => {
      const el = document.querySelector(`[data-posto="${id}"]`);
      if (el) el.classList.add('occupied');
    });
  })
  .catch(console.warn);

// --- NUOVO BLOCCO per iniettare l'SVG e agganciare rollover/click ---
// script.js

import { zonePrices } from './setup.js';
const selected = new Set();

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Parallelizza caricamento SVG e posti occupati
    const [svgText, occupied] = await Promise.all([
      fetch('svg/svg_modificato.svg').then(r => r.text()),
      fetch('occupiedSeats.json').then(r => r.json())
    ]);

    // 2) Inietta l'SVG
    const container = document.getElementById("svgContainer");
    container.innerHTML = svgText;
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("SVG non trovato dopo iniezione");

    // 3) Marca i posti già occupati
    occupied.forEach(id => {
      const el = svg.querySelector(`[data-posto="${id}"]`);
      if (el) el.classList.add("occupied");
    });

    // 4) Ripristina eventuali selezioni dal localStorage (se vuoi persisterle)
    const saved = JSON.parse(localStorage.getItem("selectedSeats") || "[]");
    saved.forEach(id => {
      const g = svg.querySelector(`#${id}`);
      if (g) {
        selected.add(id);
        g.classList.add("selected");
      }
    });

    // 5) Aggancia i listener di click **qui**, dopo iniezione e restore
    svg.querySelectorAll(".posto").forEach(posto => {
      posto.addEventListener("click", () => {
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

        // Salva lo stato per persistere dopo refresh
        localStorage.setItem("selectedSeats", JSON.stringify(Array.from(selected)));
        aggiornaBottoneConferma();
      });
    });

    // 6) Aggiorna la UI (counter, totale, bottone) una prima volta
    aggiornaBottoneConferma();

    // 7) Disabilita copia/incolla nel campo email di conferma
    const emailConferma = document.getElementById('prenotatoreEmailConferma');
    if (emailConferma) {
      emailConferma.addEventListener('paste', e => {
        e.preventDefault();
        alert("Per favore, digita nuovamente l'indirizzo email per conferma.");
      });
      emailConferma.addEventListener('copy', e => e.preventDefault());
      emailConferma.addEventListener('cut', e => e.preventDefault());
      emailConferma.addEventListener('contextmenu', e => e.preventDefault()); // disabilita tasto destro
    }

  } catch (err) {
    console.error("Errore inizializzazione mappa:", err);
  }
});

// --------------------------------------------------------------------

// Funzione di controllo intelligente del dominio email,

function distanzaLevenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j] + 1,     // rimozione
            matrix[i][j - 1] + 1,     // inserimento
            matrix[i - 1][j - 1] + 1  // sostituzione
          );
    }
  }

  return matrix[a.length][b.length];
}

function aggiornaBottoneConferma() {
  const conferma = document.getElementById("confermaPrenotazione");
  if (conferma) {
    conferma.style.display = selected.size > 0 ? "block" : "none";
  }

  const counter = document.getElementById("selectedSeats");
  if (counter) {
    counter.textContent = selected.size;
  }

  let totale = 0;
  selected.forEach(id => {
    const zona = Object.keys(zonePrices).find(z => id.includes(z)) || 'PLATEA';
    totale += zonePrices[zona];
  });

  const totalBox = document.getElementById("totalAmountModal");
  if (totalBox) {
    totalBox.textContent = totale.toFixed(2);
  }

  const btnPrenota = document.getElementById("bookButton");
  if (btnPrenota) {
    btnPrenota.disabled = selected.size === 0;
  }
}

window.apriModalePrenotatore = function () {
  document.getElementById("prenotatoreModal").style.display = "block";
};

window.chiudiModale = function () {
  document.querySelectorAll('.modal').forEach(modale => {
    modale.style.display = 'none';
  });
};

window.chiudiMessaggioConferma = function () {
  const msg = document.getElementById("messaggioConferma");
  if (msg) {
    msg.style.display = "none";
    window.location.reload();
  }
};

window.controllaPrenotatore = function () {
  const nome = document.getElementById('prenotatoreNome').value.trim();
  const email = document.getElementById('prenotatoreEmail').value.trim();
  const email2 = document.getElementById('prenotatoreEmailConferma').value.trim();
  const telefono = document.getElementById('prenotatoreTelefono').value.trim();

  // Verifica campi vuoti
  if (!nome || !email || !email2 || !telefono) {
    alert("Compila tutti i campi.");
    return;
  }

  // Verifica formato email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Inserisci un indirizzo email valido.");
    return;
  }

  // Verifica che le due email coincidano
  if (email !== email2) {
    alert("Le due email non coincidono. Controlla di averle scritte correttamente.");
    return;
  }

  // Verifica dominio simile (es. gmal.com → gmail.com)
  const dominiComuni = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'libero.it', 'fastwebnet.it'];
  const dominioInserito = email.split('@')[1]?.toLowerCase();

  if (dominioInserito && !dominiComuni.includes(dominioInserito)) {
    const suggerito = dominiComuni.find(d => distanzaLevenshtein(d, dominioInserito) <= 2);
    if (suggerito) {
      const conferma = confirm(
        `Hai scritto "${dominioInserito}". Forse intendevi "${suggerito}"?\n\nPremi OK per CONTINUARE in ogni caso oppure ANNULLA per CORREGGERE l'indirizzo email.`
      );
      if (!conferma) return;
    }
  }

  // Verifica numero di telefono: solo cifre, da 6 a 13 cifre
  if (!/^\d{6,13}$/.test(telefono)) {
    alert("Inserisci solo cifre nel numero di telefono (da 6 a 13 cifre, senza simboli).");
    return;
  }

  // Dati confermati → passaggio al modulo spettatori
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

window.apriRiepilogo = function () {
  let contenuto = '';
  let totale = 0;
  const spettatori = [];

  selected.forEach(id => {
    const nome = document.getElementById('spettatore-' + id).value;
    const zona = Object.keys(zonePrices).find(z => id.includes(z)) || 'PLATEA';
    const prezzo = zonePrices[zona];
    totale += prezzo;

    contenuto += `<b>${id}</b> (${zona} – €${prezzo.toFixed(2)}): ${nome}<br>`;
    spettatori.push({ posto: id, nome });
  });

  document.getElementById('riepilogoContenuto').innerHTML = `
    <p><b>Prenotatore:</b> ${prenotatoreData.nome}</p>
    <p><b>Email:</b> ${prenotatoreData.email}</p>
    <p><b>Telefono:</b> ${prenotatoreData.telefono}</p><hr>
    <p>${contenuto}</p>
    <p><b>Totale:</b> €${totale.toFixed(2)}</p>
  `;

  document.getElementById('spettatoriModal').style.display = 'none';
  document.getElementById('riepilogoModal').style.display = 'block';

  window.datiPrenotazione = {
    prenotatore: prenotatoreData.nome,
    email: prenotatoreData.email,
    telefono: prenotatoreData.telefono,
    spettatori,
    totale
  };
};

window.procediPagamento = function () {
  inviaEmailConferma(window.datiPrenotazione);
};

 function inviaEmailConferma(datiPrenotazione) {
  fetch('http://localhost:3000/genera-pdf-e-invia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datiPrenotazione)
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Trasforma i posti selezionati in occupati
        window.datiPrenotazione.spettatori.forEach(s => {
          const rect = document.querySelector(`[data-posto="${s.posto}"]`);
          if (rect) {
            rect.classList.add('occupied');
            rect.classList.remove('selected');
          }
        });

        // Pulisci selezione e storage
        selected.clear();
        localStorage.removeItem('selectedSeats');
        aggiornaBottoneConferma();

        // Chiude il riepilogo
        const riepilogo = document.getElementById("riepilogoModal");
        if (riepilogo) riepilogo.style.display = "none";

        // Mostra il messaggio di conferma
        const confermaMsg = document.getElementById("messaggioConferma");
        if (confermaMsg) confermaMsg.style.display = "block";
      } else {
        alert("Errore nella generazione del PDF o invio email.");
      }
    })
    .catch(error => {
      console.error("Errore chiamata backend:", error);
      alert("Errore nella richiesta al server.");
    });
}
window.inviaEmailConferma = inviaEmailConferma;
