

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
  : "https://prenotatore-postgresql.onrender.com";

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
  // ✅ Formatta data
  const dataLocale = new Date(config.showDate).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // ✅ Formatta ora (solo hh:mm)
  const oraLocale = new Date(`1970-01-01T${config.showTime}`).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });

  intestazione.innerHTML = `<strong>${config.showName}</strong><br>${dataLocale} - ore ${oraLocale}`;
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
    
    // 🔁 Polling: aggiorna i posti occupati ogni 7 secondi
setInterval(async () => {
  try {
    const aggiornati = await fetch(`/eventi/${eventoCorrente}/occupied-seats`).then(r => r.json());

    aggiornati.forEach(id => {
      const el = svg.querySelector(`[data-posto="${id}"]`);
      if (el) {
        el.classList.add("occupied");
        el.classList.remove("selected");
        selected.delete(id);
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
    aggiornaBottoneConferma();
  } catch (e) {
    console.warn("⚠️ Impossibile aggiornare la mappa dei posti:", e);
  }
}, 7000); // ogni 7 secondi

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
//
//
//
//
// Modale Prenotatore TEST: aggiunge i dati predefiniti

window.apriModalePrenotatore = function () {
  // Precompila i campi (solo per test)
  document.getElementById("prenotatoreNome").value = "Mario Test";
  document.getElementById("prenotatoreEmail").value = "enzio.isaia@gmail.com";
  document.getElementById("prenotatoreEmailConferma").value = "enzio.isaia@gmail.com";
  document.getElementById("prenotatoreTelefono").value = "3331234567";

  document.getElementById("prenotatoreModal").style.display = "block";
};

//
//
//
//
//Per ripristinare la funzione togli il commento alla modale qui sotto e commenta quella sopra
// Modale Prenotatore effettiva
/*
window.apriModalePrenotatore = function () {
  document.getElementById("prenotatoreModal").style.display = "block";
};
*/
//
//
//
//
//
//
//
//
//
//

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
  const campoPrenotatore = document.getElementById('prenotatoreNome');
  const campoEmail = document.getElementById('prenotatoreEmail');
  const campoEmail2 = document.getElementById('prenotatoreEmailConferma');
  const campoTelefono = document.getElementById('prenotatoreTelefono');

  // 🔠 Formattazione automatica del nome
  campoPrenotatore.value = campoPrenotatore.value
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
    
    // 🔡 Minuscolo automatico su email
campoEmail.value = campoEmail.value.toLowerCase();
campoEmail2.value = campoEmail2.value.toLowerCase();

  // ✅ Validazione Nome e Cognome
  validaCampoNome(campoPrenotatore);
  if (!campoPrenotatore.checkValidity()) {
    campoPrenotatore.reportValidity();
    return;
  }

  // ✅ Validazione Email
  const email = campoEmail.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    campoEmail.setCustomValidity("Inserisci un indirizzo email valido");
    campoEmail.reportValidity();
    return;
  } else {
    campoEmail.setCustomValidity("");
  }

  // ✅ Conferma Email
  const email2 = campoEmail2.value.trim();
  if (email !== email2) {
    campoEmail2.setCustomValidity("Le due email non coincidono");
    campoEmail2.reportValidity();
    return;
  } else {
    campoEmail2.setCustomValidity("");
  }

  // ✅ Telefono
  const telefono = campoTelefono.value.trim();
  if (!/^\d{6,13}$/.test(telefono)) {
    campoTelefono.setCustomValidity("Inserisci solo cifre");
    campoTelefono.reportValidity();
    return;
  } else {
    campoTelefono.setCustomValidity("");
  }

  // 🔍 Controllo dominio simile (gmail vs gmal)
  const dominiComuni = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'libero.it', 'fastwebnet.it'];
  const dominioInserito = email.split('@')[1]?.toLowerCase();
if (dominioInserito && !dominiComuni.includes(dominioInserito)) {
  const suggerito = dominiComuni.find(d => distanzaLevenshtein(d, dominioInserito) <= 2);
  if (suggerito) {
    campoEmail.setCustomValidity(`Hai scritto "${dominioInserito}". Forse intendevi "${suggerito}"`);
    campoEmail.reportValidity();
    return;
  } else {
    campoEmail.setCustomValidity('');
  }
}

  // ✅ Se tutto è valido → salva i dati
  window.prenotatoreData = {
    nome: campoPrenotatore.value.trim(),
    email,
    telefono
  };

  // 👉 Passaggio alla modale degli spettatori
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

//
//
//
//
//
//
// Dati farlocchi e inseriti automaticamente degli spettatori
//commentala se vuoi inibirla

  input.value = "Enzio Isaia"; // ← AGGIUNTA QUI

//
//
//
//
//
//

    // Formattazione e validazione live
    input.addEventListener('input', () => {
      input.value = input.value
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      validaCampoNome(input);
    });

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
  });

  document.getElementById('prenotatoreModal').style.display = 'none';
  document.getElementById('spettatoriModal').style.display = 'block';
};

['prenotatoreEmail', 'prenotatoreEmailConferma', 'prenotatoreTelefono'].forEach(id => {
  const campo = document.getElementById(id);
  campo.addEventListener('input', () => campo.setCustomValidity(''));
});






window.apriRiepilogo = function () {
  // ✅ Verifica che tutti i campi spettatori siano validi
  const campiSpettatori = document.querySelectorAll('[id^="spettatore-"]');
  for (let campo of campiSpettatori) {
    if (!campo.checkValidity()) {
      campo.reportValidity(); // Mostra messaggio di errore
      return;
    }
  }
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
  const barraAttesa = document.getElementById('barraAttesa');
  const barraInterna = document.getElementById('barraInterna');

  barraAttesa.style.display = 'block';
  document.body.style.pointerEvents = 'none';
  barraInterna.style.width = '0%';

  const bottone = document.querySelector('#riepilogoModal .button-group button');
  if (bottone) {
    bottone.disabled = true;
    bottone.innerText = "Attendere...";
  }

  let progresso = 0;
  const intervallo = setInterval(() => {
    if (progresso < 80) {
      progresso += Math.floor(Math.random() * 10) + 5;
      if (progresso > 80) progresso = 80;
      barraInterna.style.width = `${progresso}%`;
    }
  }, 300);

  inviaEmailConferma(window.datiPrenotazione)
    .then(() => {
      clearInterval(intervallo);
      barraInterna.style.width = '100%';

      setTimeout(() => {
        barraAttesa.style.display = 'none';
        document.body.style.pointerEvents = 'auto';

        if (bottone) {
          bottone.disabled = false;
          bottone.innerText = "Conferma e Invia";
        }

        const confermaMsg = document.getElementById("messaggioConferma");
        if (confermaMsg) confermaMsg.style.display = "block";
      }, 500);
    })
    .catch(error => {
      // ✅ FERMA ANIMAZIONE E INTERAZIONE
      clearInterval(intervallo);
      barraAttesa.style.display = 'none';
      document.body.style.pointerEvents = 'auto';

      if (bottone) {
        bottone.disabled = false;
        bottone.innerText = "Conferma e Invia";
      }

      // ✅ BLOCCA schermata di conferma se errore da `inviaEmailConferma`
      console.error("Errore chiamata backend:", error);
      alert("Errore durante l'invio della conferma.");
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
    .then(async response => {
      const data = await response.json();

if (response.status === 409) {
  const msg = data.error || "⚠️ Uno o più posti sono già stati prenotati da altri.";
  alert(msg);

  // Prova a trovare il posto indicato nell'errore
  const match = msg.match(/posto\s+([A-Za-z0-9]+)/i);
  if (match) {
    const postoOccupato = match[1];
    selected.delete(postoOccupato);

    const rect = document.querySelector(`[data-posto="${postoOccupato}"]`);
    if (rect) {
      rect.classList.remove("selected");
      rect.classList.add("occupied");
    }

    // Aggiorna interfaccia e bottone
    localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
    aggiornaBottoneConferma();
  }

  // 🚫 BLOCCA IL FLUSSO completamente
  throw new Error("Posto già prenotato da altri");
}

      if (!response.ok || !data.success) {
        alert("Errore nella generazione del PDF o invio email.");
        return;
      }

      // ✅ Successo → aggiorna UI
window.datiPrenotazione.spettatori.forEach(s => {
  selected.delete(s.posto); // ✅ rimuove il posto da quelli selezionati

  const rect = document.querySelector(`[data-posto="${s.posto}"]`);
  if (rect) {
    rect.classList.add('occupied');
    rect.classList.remove('selected');
  }
});

// ✅ aggiorna localStorage
localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));

// ✅ aggiorna bottone e interfaccia
aggiornaBottoneConferma();
      
      // 🔁 Forza aggiornamento mappa in tempo reale (sincronizza da DB)
const aggiornati = await fetch(`/eventi/${eventoCorrente}/occupied-seats`).then(r => r.json());
aggiornati.forEach(id => {
  const el = document.querySelector(`[data-posto="${id}"]`);
  if (el) {
    el.classList.add("occupied");
    el.classList.remove("selected");
    selected.delete(id);
  }
});

      selected.clear();
      localStorage.removeItem(storageKey);
      aggiornaBottoneConferma();

      const riepilogo = document.getElementById("riepilogoModal");
      if (riepilogo) riepilogo.style.display = "none";

      const confermaMsg = document.getElementById("messaggioConferma");
      if (confermaMsg) confermaMsg.style.display = "block";
    })
    .catch(error => {
      console.error("Errore chiamata backend:", error);
      alert("Errore nella richiesta al server.");
    });
}
function validaCampoNome(input) {
  const parole = input.value.trim().split(/\s+/);
  const valide = parole.filter(p => p.length >= 2);
  if (valide.length >= 2) {
    input.setCustomValidity('');
  } else {
    input.setCustomValidity('Inserisci Nome e Cognome');
  }
}

// Formattazione e validazione automatica live per prenotatore
document.getElementById('prenotatoreNome').addEventListener('input', function () {
  this.value = this.value
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  validaCampoNome(this); // ✅ aggiunto
});

['prenotatoreEmail', 'prenotatoreEmailConferma'].forEach(id => {
  const campo = document.getElementById(id);
  campo.addEventListener('input', () => {
    campo.value = campo.value.toLowerCase();       // 🔡 forza minuscolo
    campo.setCustomValidity('');                   // ✅ reset validazione se corregge
  });
});

window.inviaEmailConferma = inviaEmailConferma;
