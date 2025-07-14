

// --- NUOVO BLOCCO per iniettare l'SVG e agganciare rollover/click ---
let showName = '';
let showDate = '';
let imgIntest = '';
let zonePrices = {};

const selected = new Set();
let eventoCorrente = '';
let storageKey = '';

// ✅ BASE_URL si adatta automaticamente a locale o online
const BASE_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : "https://teatro-booking-2.onrender.com";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    eventoCorrente = pathParts[1];

    // ✅ Carica configurazione dal database tramite l'endpoint
    const config = await fetch(`/eventi/${eventoCorrente}/config`)
      .then(r => {
        if (!r.ok) throw new Error("Impossibile caricare il config dal database");
        return r.json();
      });

    showName = config.showName;
    showDate = config.showDate;
    imgIntest = config.imgIntest;
    zonePrices = config.zonePrices || {}; // ⚠️ stringa → oggetto JS

// ✅ Intestazione sopra la piantina
const intestazione = document.getElementById("intestazioneSpettacolo");
if (intestazione) {
intestazione.innerHTML = `<strong>${config.showName}</strong><br>${config.showDate} ${config.showTime}`;
}

// ✅ Carica il file SVG con DOMParser (compatibile Safari iOS)
const svgText = await fetch(`/eventi/${eventoCorrente}/svg/${config.svgFile}`).then(r => r.text());
const parser = new DOMParser();
const doc = parser.parseFromString(svgText, "image/svg+xml");
const svg = doc.querySelector("svg");
if (!svg) throw new Error("SVG non trovato dopo parsing");

// ✅ Forza visibilità e dimensioni compatibili
svg.setAttribute("width", "100%");
svg.setAttribute("height", "auto");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
svg.style.display = "block";
svg.style.maxWidth = "100%";

// ✅ Inserisce nel contenitore
const container = document.getElementById("svgContainer");
container.innerHTML = "";
container.appendChild(svg);

    // ✅ Carica i posti occupati
    const occupied = await fetch(`/eventi/${eventoCorrente}/occupied-seats`).then(r => r.json());

    // ✅ Marca i posti occupati
    occupied.forEach(id => {
      const el = svg.querySelector(`[data-posto="${id}"]`);
      if (el) el.classList.add("occupied");
    });

    // ✅ Ripristina eventuali selezioni precedenti
    storageKey = `selectedSeats_${eventoCorrente}`;
    
    Object.keys(localStorage).forEach(k => {
  if (k.startsWith('selectedSeats_') && k !== storageKey) {
    localStorage.removeItem(k); // pulizia selezioni di eventi diversi
  }
});
    
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    saved.forEach(id => {
      const g = svg.querySelector(`#${id}`);
      if (g && !g.classList.contains("occupied")) {
        selected.add(id);
        g.classList.add("selected");
      }
    });

    // ✅ Attacca i click sui posti selezionabili
    svg.querySelectorAll(".posto").forEach(posto => {
      posto.addEventListener("click", () => {
        const g = posto.closest("g");
        const id = g?.id;
        if (!id || g.classList.contains("occupied")) return;

        if (selected.has(id)) {
          selected.delete(id);
          g.classList.remove("selected");
        } else {
          if (selected.size >= 8) {
            alert("Puoi prenotare al massimo 8 posti.");
            return;
          }
          selected.add(id);
          g.classList.add("selected");
        }

        localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
        aggiornaBottoneConferma();
      });
    });

    aggiornaBottoneConferma();

    const emailConferma = document.getElementById('prenotatoreEmailConferma');
    if (emailConferma) {
      emailConferma.addEventListener('paste', e => {
        e.preventDefault();
        alert("Per favore, digita manualmente l'indirizzo email.");
      });
      emailConferma.addEventListener('copy', e => e.preventDefault());
      emailConferma.addEventListener('cut', e => e.preventDefault());
      emailConferma.addEventListener('contextmenu', e => e.preventDefault());
    }

  } catch (err) {
    console.error("❌ Errore inizializzazione mappa:", err);
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

    contenuto += `Posto: <b>${id}</b> (€${prezzo.toFixed(2)}): <b>${nome}</b><br>`;
    spettatori.push({ posto: id, nome, prezzo });
  });

  document.getElementById('riepilogoContenuto').innerHTML = `
    <p>Prenotatore: <b>${prenotatoreData.nome}</b></p>
    <p>Email: <b>${prenotatoreData.email}</b></p>
    <p>Telefono: <b>${prenotatoreData.telefono}</b></p><hr>
    <p>${contenuto}</p>
    <p>Totale: <b>€${totale.toFixed(2)}</b></p>
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
  // Mostra la barra di attesa
  const barraAttesa = document.getElementById('barraAttesa');
  const barraInterna = document.getElementById('barraInterna');
  barraAttesa.style.display = 'block';
  document.body.style.pointerEvents = 'none'; // Blocca tutte le interazioni

  // Resetta e avvia animazione della barra
  barraInterna.style.width = '0%';
  setTimeout(() => {
    barraInterna.style.width = '100%';
  }, 100);

  inviaEmailConferma(window.datiPrenotazione)
    .finally(() => {
      // Nascondi barra di attesa e riattiva interazioni
      barraAttesa.style.display = 'none';
      document.body.style.pointerEvents = 'auto';
    });
};

function inviaEmailConferma(datiPrenotazione) {
  return fetch(`${BASE_URL}/genera-pdf-e-invia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      evento: eventoCorrente,
      ...datiPrenotazione
    })
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
        localStorage.removeItem(storageKey);
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
