// --- NUOVO BLOCCO per iniettare l'SVG e agganciare rollover/click ---
let showName = "";
let showDate = "";
let imgIntest = "";
let zonePrices = {};

// 🔧 PARAMETRI CONFIGURABILI (client-side)
const MAX_POSTI_PRENOTABILI = 8; //numero massimo dei posti prenotabili
const MAX_UTENTI_INTERATTIVI = 4; // numero massimo degli utenti che possono operare
const INTERVALLO_POLLING_MS = 3000; // il tempo di verifca econtrollo sui posti occupati in piatina

const selected = new Set();
let eventoCorrente = "";
let storageKey = "";

// ✅ BASE_URL si adatta automaticamente a locale o online
const BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://prenotatore-postgresql.onrender.com";

// ✅ Inizializza WebSocket
const socket = io(BASE_URL);

let mioSocketId = "";

async function attendiSocketId() {
  return new Promise((resolve) => {
    if (mioSocketId) return resolve(mioSocketId);
    socket.on("connect", () => {
      mioSocketId = socket.id;
      resolve(mioSocketId);
    });
  });
}

let prenotazioneInCorso = false;

document.addEventListener("DOMContentLoaded", () => {
  const okButton = document.getElementById("okConfermaBtn");
  if (okButton) {
    okButton.addEventListener("click", () => {
      socket.disconnect(); // ❌ disconnette la sessione WebSocket attiva
      localStorage.removeItem(storageKey); // 🧹 pulisce i posti selezionati
      window.location.href = window.location.href; // 🔁 ricarica forzata dell'intera pagina
    });
  }
});

socket.on("connect", () => {
  mioSocketId = socket.id;
});

// 🎯 Avanzamento reale progress bar
socket.on("stato-prenotazione", ({ percentuale, fase }) => {
  aggiornaBarraAvanzamento(percentuale, fase);
  if (fase === 'completata' && percentuale === 100) {
  selected.forEach((id) => {
    const g = document.getElementById(id);
    if (g) {
      g.classList.remove("selected", "bloccato");
      g.classList.add("occupied");

      const rect = g.querySelector("rect");
      if (rect) {
        rect.removeAttribute("fill");
        rect.style.fill = "#dc3545"; // rosso occupato
      }
    }
  });
}
});

// 🔸 Posto bloccato da altri
socket.off("posto-bloccato");
socket.on("posto-bloccato", ({ evento, posto }) => {
  if (evento === eventoCorrente) {
    const el = document.querySelector(`[data-posto="${posto}"]`);
    if (el && !el.classList.contains("occupied")) {
      el.classList.add("bloccato");
      el.classList.remove("selected");
    }
  }
});

socket.on("posizione-utente", ({ totale, posizione }) => {
  const infoBox = document.getElementById("infoCoda");
  const overlay = document.getElementById("overlayBloccaCoda");

  if (infoBox) {
    infoBox.innerHTML = `
      👥 Utenti attivi: <b>${totale}</b> - 
      🧍 La tua posizione: <b>#${posizione}</b>`;
    infoBox.style.color = "#444";
  }

  if (overlay) {
    if (posizione > MAX_UTENTI_INTERATTIVI) {
      overlay.style.display = "flex";

      const messaggio = document.getElementById("messaggioCoda");
      if (messaggio) {
        messaggio.innerHTML = `Solo <b>${MAX_UTENTI_INTERATTIVI}</b> utenti alla volta possono effettuare la prenotazione.<br>Appena sarà il tuo turno potrai selezionare i posti.`;
      }
    } else {
      overlay.style.display = "none";
    }
  }
});

socket.on("utenti-attivi", (totale) => {
  const infoBox = document.getElementById("infoCoda");
  if (infoBox && !infoBox.innerHTML.includes("#")) {
    infoBox.innerHTML = `👥 Utenti attivi: <b>${totale}</b>`;
    infoBox.style.color = "#666";
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const pathParts = window.location.pathname.split("/").filter((p) => p);
    eventoCorrente = pathParts[1];

    // 🔁 Se ci sono posti salvati in localStorage, li sblocca subito
    const key = `selectedSeats_${eventoCorrente}`;
    const memorizzati = JSON.parse(localStorage.getItem(key) || "[]");

    if (memorizzati.length > 0) {
      socket.emit("libera-posti", {
        evento: eventoCorrente,
        posti: memorizzati,
      });

      // li sblocca anche visivamente (toglie classi .selected e fill)
      memorizzati.forEach((id) => {
        const g = document.getElementById(id);
        if (g) {
          g.classList.remove("selected", "bloccato", "occupied");
          const rect = g.querySelector("rect");
          if (rect) {
            rect.removeAttribute("fill");
            rect.style.fill = "#dddddd";
          }
        }
      });

      // svuota subito la memoria
      localStorage.removeItem(key);
    }

    // ✅ Ripristina eventuali selezioni precedenti
    storageKey = `selectedSeats_${eventoCorrente}`;
    const mieiPosti = new Set(
      JSON.parse(localStorage.getItem(storageKey) || "[]")
    );

    // ✅ Carica configurazione dal database tramite l'endpoint
    const config = await fetch(`/eventi/${eventoCorrente}/config`).then((r) => {
      if (!r.ok) throw new Error("Impossibile caricare il config dal database");
      return r.json();
    });

    showName = config.showName;
    showDate = config.showDate;
    imgIntest = config.imgIntest;
    zonePrices = config.zonePrices || {};

    // ✅ Intestazione spettacolo
    const intestazione = document.getElementById("intestazioneSpettacolo");
    if (intestazione) {
      const dataLocale = new Date(config.showDate).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const oraLocale = new Date(
        `1970-01-01T${config.showTime}`
      ).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      intestazione.innerHTML = `<strong>${config.showName}</strong><br>${dataLocale} - ore ${oraLocale}`;
    }

    // ✅ Carica SVG
    const svgText = await fetch(
      `/eventi/${eventoCorrente}/svg/${config.svgFile}`
    ).then((r) => r.text());
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) throw new Error("SVG non trovato dopo parsing");

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "auto");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.display = "block";
    svg.style.maxWidth = "100%";

    const container = document.getElementById("svgContainer");
    container.innerHTML = "";
    container.appendChild(svg);

    // 🔸 Blocchi già attivi dal server
    socket.off("blocchi-esistenti");
    socket.on("blocchi-esistenti", ({ evento, posti }) => {
      if (evento !== eventoCorrente) return;

      const mieiPostiAttivi = new Set(
        JSON.parse(localStorage.getItem(storageKey) || "[]")
      );
      let modificato = false;

      // 🔥 LIBERA tutti i posti che erano i miei, ma sono rimasti bloccati
      const daLiberare = [];

      posti.forEach((posto) => {
        const el = document.querySelector(`[data-posto="${posto}"]`);
        if (el && !el.classList.contains("occupied")) {
          if (mieiPostiAttivi.has(posto)) {
            daLiberare.push(posto); // 🔥 aggiungi alla lista da liberare
          } else {
            const g = el.closest("g");
            if (g) g.classList.add("bloccato");
            el.classList.add("bloccato");
          }
        }
      });

      // 🔥 Se c'erano posti miei bloccati, mandiamo subito libera-posti
      if (daLiberare.length > 0) {
        socket.emit("libera-posti", {
          evento: eventoCorrente,
          posti: daLiberare,
        });
      }

      // Ricostruisci selected con quelli ancora validi
      selected.clear();
      mieiPostiAttivi.forEach((p) => {
        if (!daLiberare.includes(p)) {
          selected.add(p);
          const el = document.querySelector(`[data-posto="${p}"]`);
          if (el) el.classList.add("selected");
        }
      });

      localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
      aggiornaBottoneConferma();
    });

    // ✅ Carica posti occupati
    const occupied = await fetch(
      `/eventi/${eventoCorrente}/occupied-seats`
    ).then((r) => r.json());
    occupied.forEach((id) => {
      const el = svg.querySelector(`[data-posto="${id}"]`);
      if (el) el.classList.add("occupied");
    });

    // 🔁 Polling ogni 7 secondi
    setInterval(async () => {
      try {
        const aggiornati = await fetch(
          `/eventi/${eventoCorrente}/occupied-seats`
        ).then((r) => r.json());
        aggiornati.forEach((id) => {
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
    }, INTERVALLO_POLLING_MS);

    // 🧹 Pulisce altre selezioni
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("selectedSeats_") && k !== storageKey) {
        localStorage.removeItem(k);
      }
    });

    // ✅ Ripristina solo quelli ancora validi (non bloccati o occupati)
    mieiPosti.forEach((id) => {
      const g = svg.querySelector(`#${id}`);
      if (
        g &&
        !g.classList.contains("occupied") &&
        !g.classList.contains("bloccato")
      ) {
        selected.add(id);
        g.classList.add("selected");
      }
    });

    // 🎯 Gestione click sui posti (con Safari iPhone fix)
    svg.querySelectorAll(".posto").forEach((posto) => {
      posto.addEventListener("click", () => {
        const g = posto.closest("g");
        const id = g?.id;
        if (!id || g.classList.contains("occupied")) return;

        const rect = posto; // <rect class="posto">

        if (selected.has(id)) {
          selected.delete(id);
          g.classList.remove("selected");

          // ✅ Forza fill GRIGIO dopo la deselezione (Safari fix)
          rect.removeAttribute("fill");
          rect.style.fill = "#dddddd";

          socket.emit("libera-posti", { evento: eventoCorrente, posti: [id] });
        } else {
          if (selected.size >= MAX_POSTI_PRENOTABILI) {
            alert("Puoi prenotare al massimo 8 posti.");
            return;
          }

          selected.add(id);
          g.classList.add("selected");

          // ✅ Safari iOS fix: forza subito fill blu per evitare verde "hover"
          rect.removeAttribute("fill");
          rect.style.fill = "#007bff"; // forza blu

          socket.emit("blocca-posto", { evento: eventoCorrente, posto: id });
        }

        localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
        aggiornaBottoneConferma();
      });
    });

    aggiornaBottoneConferma();

    const emailConferma = document.getElementById("prenotatoreEmailConferma");
    if (emailConferma) {
      emailConferma.addEventListener("paste", (e) => {
        e.preventDefault();
        alert("Per favore, digita manualmente l'indirizzo email.");
      });
      emailConferma.addEventListener("copy", (e) => e.preventDefault());
      emailConferma.addEventListener("cut", (e) => e.preventDefault());
      emailConferma.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    // 🔸 Prenotazione confermata
    socket.off("posti-prenotati");
    socket.on("posti-prenotati", ({ evento, posti }) => {
      if (evento === eventoCorrente) {
        posti.forEach((posto) => {
          const el = document.querySelector(`[data-posto="${posto}"]`);
          if (el) {
            el.classList.add("occupied");
            el.classList.remove("selected", "bloccato");
          }
        });
      }
    });

    // 🔸 Posti liberati (timeout o uscita utente)
    socket.off("posti-liberati");
    socket.on("posti-liberati", ({ evento, posti }) => {
      if (evento !== eventoCorrente) return;

      let modificato = false;

      posti.forEach((posto) => {
        const el = document.querySelector(`[data-posto="${posto}"]`);
        const g = el?.closest("g");

        if (!el || !g) return;

        // 🔓 Rimuove il blocco sia dal gruppo che dal rect (per sicurezza)
        g.classList.remove("bloccato");
        el.classList.remove("bloccato");

        // ✅ Se il posto era selezionato da me
        selected.delete(posto);
        g.classList.remove("selected", "bloccato");
        el.classList.remove("selected", "bloccato");

        // 🔧 Rimuove colore BLU forzato per Safari iOS
        el.removeAttribute("fill");
        el.style.fill = "#dddddd";

        modificato = true;
      });

      if (modificato) {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
        aggiornaBottoneConferma();
      }

      console.log("⏱️ Timeout o uscita: sbloccati i posti", posti);
    });

    // ✅ Libera i posti anche se l'utente aggiorna o chiude la pagina
    window.addEventListener("beforeunload", () => {
      if (selected.size > 0) {
        socket.emit("libera-posti", {
          evento: eventoCorrente,
          posti: Array.from(selected),
        });
      }
    });

    // ✅ Ora puoi richiedere i blocchi esistenti
    socket.emit("richiesta-blocchi", { evento: eventoCorrente });

    // 🔄 Mostra messaggio di attesa o posizione in coda
  } catch (err) {
    console.error("❌ Errore inizializzazione mappa:", err);
  }
});
// Funzione di controllo intelligente del dominio email,

function distanzaLevenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j] + 1, // rimozione
              matrix[i][j - 1] + 1, // inserimento
              matrix[i - 1][j - 1] + 1 // sostituzione
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
  selected.forEach((id) => {
    const zona =
      Object.keys(zonePrices).find((z) => id.includes(z)) || "PLATEA";
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
  document.getElementById("prenotatoreEmailConferma").value =
    "enzio.isaia@gmail.com";
  document.getElementById("prenotatoreTelefono").value = "3331234567";

  document.getElementById("prenotatoreModal").style.display = "block";
  mostraOverlayBloccaInterazioni(); // 👈 AGGIUNTA
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
// ✅ Resetta correttamente la selezione utente
window.resetSelezioneUtente = function () {
  // Rimuove classe 'selected' da tutti i posti selezionati
  selected.forEach((id) => {
    const el = document.querySelector(`[data-posto="${id}"]`);
    if (el) el.classList.remove("selected");
  });

  // Pulisce memoria locale e oggetto selected
  selected.clear();
  localStorage.removeItem(storageKey);

  // Se usi WebSocket, notifica il rilascio (opzionale)
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "libera-posti",
        evento: eventoCorrente,
        posti: Array.from(selected),
      })
    );
  }

  aggiornaBottoneConferma();
};

// ✅ Chiude tutte le modali
window.chiudiModale = function () {
  document.querySelectorAll(".modal").forEach((modale) => {
    modale.style.display = "none";
  });
  nascondiOverlayBloccaInterazioni(); // 👈 AGGIUNTA
};


window.controllaPrenotatore = function () {
  const campoPrenotatore = document.getElementById("prenotatoreNome");
  const campoEmail = document.getElementById("prenotatoreEmail");
  const campoEmail2 = document.getElementById("prenotatoreEmailConferma");
  const campoTelefono = document.getElementById("prenotatoreTelefono");

  // 🔠 Formattazione automatica del nome
  campoPrenotatore.value = campoPrenotatore.value
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

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
  const dominiComuni = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "libero.it",
    "fastwebnet.it",
  ];
  const dominioInserito = email.split("@")[1]?.toLowerCase();
  if (dominioInserito && !dominiComuni.includes(dominioInserito)) {
    const suggerito = dominiComuni.find(
      (d) => distanzaLevenshtein(d, dominioInserito) <= 2
    );
    if (suggerito) {
      campoEmail.setCustomValidity(
        `Hai scritto "${dominioInserito}". Forse intendevi "${suggerito}"`
      );
      campoEmail.reportValidity();
      return;
    } else {
      campoEmail.setCustomValidity("");
    }
  }

  // ✅ Se tutto è valido → salva i dati
  window.prenotatoreData = {
    nome: campoPrenotatore.value.trim(),
    email,
    telefono,
  };

  // 👉 Passaggio alla modale degli spettatori
  const container = document.getElementById("spettatoriInput");
  container.innerHTML = "";

  Array.from(selected).forEach((id) => {
    const formGroup = document.createElement("div");
    formGroup.className = "form-group";

    const label = document.createElement("label");
    label.setAttribute("for", `spettatore-${id}`);
    label.textContent = `Spettatore per posto ${id}`;

    const input = document.createElement("input");
    input.id = `spettatore-${id}`;
    input.placeholder = "Nome e Cognome";
    input.required = true;
    input.type = "text";

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
    input.addEventListener("input", () => {
      input.value = input.value
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      validaCampoNome(input);
    });

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
  });

  document.getElementById("prenotatoreModal").style.display = "none";
  document.getElementById("spettatoriModal").style.display = "block";
  mostraOverlayBloccaInterazioni(); // 👈 AGGIUNTA
};

["prenotatoreEmail", "prenotatoreEmailConferma", "prenotatoreTelefono"].forEach(
  (id) => {
    const campo = document.getElementById(id);
    campo.addEventListener("input", () => campo.setCustomValidity(""));
  }
);

window.apriRiepilogo = function () {
  // ✅ Verifica che tutti i campi spettatori siano validi
  const campiSpettatori = document.querySelectorAll('[id^="spettatore-"]');
  for (let campo of campiSpettatori) {
    if (!campo.checkValidity()) {
      campo.reportValidity(); // Mostra messaggio di errore
      return;
    }
  }
  let contenuto = "";
  let totale = 0;
  const spettatori = [];

  selected.forEach((id) => {
    const nome = document.getElementById("spettatore-" + id).value;
    const zona =
      Object.keys(zonePrices).find((z) => id.includes(z)) || "PLATEA";
    const prezzo = zonePrices[zona];
    totale += prezzo;

    contenuto += `Posto: <b>${id}</b> (€${prezzo.toFixed(
      2
    )}): <b>${nome}</b><br>`;
    spettatori.push({ posto: id, nome, prezzo });
  });

  document.getElementById("riepilogoContenuto").innerHTML = `
    <p>Prenotatore: <b>${prenotatoreData.nome}</b></p>
    <p>Email: <b>${prenotatoreData.email}</b></p>
    <p>Telefono: <b>${prenotatoreData.telefono}</b></p><hr>
    <p>${contenuto}</p>
    <p>Totale: <b>€${totale.toFixed(2)}</b></p>
  `;

  document.getElementById("spettatoriModal").style.display = "none";
  document.getElementById("riepilogoModal").style.display = "block";
  mostraOverlayBloccaInterazioni(); // 👈 AGGIUNTA

  window.datiPrenotazione = {
    prenotatore: prenotatoreData.nome,
    email: prenotatoreData.email,
    telefono: prenotatoreData.telefono,
    spettatori,
    totale,
  };
};

window.procediPagamento = async function () {
  const bottone = document.querySelector(
    "#riepilogoModal .button-group button"
  );

  // 🔒 BLOCCO di sicurezza: controlla che i posti siano ancora validi
  let ancoraValidi = true;
  selected.forEach((id) => {
    const g = document.querySelector(`#${id}`);
    if (
      !g ||
      g.classList.contains("bloccato") ||
      g.classList.contains("occupied")
    ) {
      ancoraValidi = false;
    }
  });

  if (!ancoraValidi) {
    alert(
      "⏱️ Alcuni dei posti selezionati non sono più disponibili. Ricarica la pagina e riprova."
    );
    resetSelezioneUtente(); // ← funzione che svuota `selected`, `localStorage` e aggiorna mappa
    return;
  }

  // Chiudi la modale riepilogo prima di mostrare la barra di attesa
  const riepilogoModal = document.getElementById("riepilogoModal");
  if (riepilogoModal) riepilogoModal.style.display = "none";

  const barraAttesa = document.getElementById("barraAttesa");
  const barraInterna = document.getElementById("barraInterna");

  barraAttesa.style.display = "block";

  const barraMessaggio = document.getElementById("barraMessaggio");
  if (barraMessaggio) {
    barraMessaggio.innerHTML =
      'Elaborazione in corso <span class="puntini">.</span>';
    let count = 0;
    window.animazionePuntini = setInterval(() => {
      const puntini = barraMessaggio.querySelector(".puntini");
      if (puntini) {
        count = (count + 1) % 4;
        puntini.textContent = ".".repeat(count + 1);
      }
    }, 400);

    document.body.style.pointerEvents = "none";
    barraInterna.style.width = "0%";

    if (bottone) {
      bottone.disabled = true;

      await attendiSocketId();
if (!mioSocketId || mioSocketId.length < 5) {
  alert("Errore: connessione WebSocket non attiva. Ricarica la pagina.");
  return;
}

      if (bottone) {
        bottone.disabled = true;
        bottone.innerText = "Attendere...";
      }
    } // chiude if (bottone)
  } // chiude if (barraMessaggio)

  // Lascia avanzamento reale al WebSocket

  try {
    prenotazioneInCorso = true;
    if (
      !window.datiPrenotazione ||
      !Array.isArray(window.datiPrenotazione.spettatori) ||
      window.datiPrenotazione.spettatori.length === 0
    ) {
      alert("⚠️ Errore: dati di prenotazione mancanti o incompleti.");
      return;
    }
    await inviaEmailConferma(window.datiPrenotazione);
  } catch (error) {
    clearInterval(window.animazionePuntini);
    barraAttesa.style.display = "none";
    document.body.style.pointerEvents = "auto";

    if (bottone) {
      bottone.disabled = false;
      bottone.innerText = "Conferma e Invia";
    }

    // ✅ Blocca schermata verde SOLO se è errore 409 (posto occupato)
    if (error.message === "409") {
      console.warn("⚠️ Prenotazione annullata per conflitto sui posti.");
      return;
    }

    alert(error.message || "Errore durante la prenotazione.");
    console.error("Errore chiamata backend:", error);
    return;
  }
}; // chiude window.procediPagamento

function inviaEmailConferma(datiPrenotazione) {
  // 👉 Blocca definitivamente i posti: evita timeout mentre aspettiamo il PDF
  socket.emit("finalizza-prenotazione", { evento: eventoCorrente });
  return fetch(`${BASE_URL}/genera-pdf-e-invia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: eventoCorrente,
      ...datiPrenotazione,
socketId: mioSocketId || socket.id,
    }),
  })
    .then(async (response) => {
      const data = await response.json();

      if (data.message?.includes("coda")) {
        alert(
          "⏳ La tua richiesta è stata messa in coda. Riceverai i biglietti appena disponibili."
        );
      }

      if (response.status === 409) {
        const msg =
          data.error || "⚠️ Uno o più posti sono già stati prenotati da altri.";
        alert(msg);

        // Prova a trovare il posto indicato nell'errore
        const match = msg.match(/posto\s+([A-Za-z0-9]+)/i);
        if (match) {
          const postoOccupato = match[1];
          selected.delete(postoOccupato);

          const rect = document.querySelector(
            `[data-posto="${postoOccupato}"]`
          );
          if (rect) {
            rect.classList.remove("selected");
            rect.classList.add("occupied");
          }

          // Aggiorna interfaccia e bottone
          localStorage.setItem(
            storageKey,
            JSON.stringify(Array.from(selected))
          );
          aggiornaBottoneConferma();
        }

        // 🚫 BLOCCA IL FLUSSO completamente
        throw new Error("409");
      }

      if (!response.ok || !data.success) {
        alert("Errore nella generazione del PDF o invio email.");
        return;
      }
      
      
    

      // ✅ Successo → aggiorna UI
      const postiPrenotati = window.datiPrenotazione.spettatori.map(
        (s) => s.posto
      );
      socket.emit("prenota-posti", {
        evento: eventoCorrente,
        posti: postiPrenotati,
      });

      postiPrenotati.forEach((posto) => {
        selected.delete(posto);

        const el = document.querySelector(`[data-posto="${posto}"]`);
        const g = el?.closest("g");

        if (g) {
          g.classList.remove("selected");
          g.classList.add("occupied");
        }
      });

      // ✅ aggiorna localStorage
      localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));

      // ✅ aggiorna bottone e interfaccia
      aggiornaBottoneConferma();

      // 🔁 Forza aggiornamento mappa in tempo reale (sincronizza da DB)
      const aggiornati = await fetch(
        `/eventi/${eventoCorrente}/occupied-seats`
      ).then((r) => r.json());
      aggiornati.forEach((id) => {
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
    })
    .catch((error) => {
      clearInterval(window.animazionePuntini);
      document.body.style.pointerEvents = "auto";
      const barraAttesa = document.getElementById("barraAttesa");
      if (barraAttesa) barraAttesa.style.display = "none";

      const bottone = document.querySelector(
        "#riepilogoModal .button-group button"
      );
      if (bottone) {
        bottone.disabled = false;
        bottone.innerText = "Conferma e Invia";
      }

      console.error("Errore chiamata backend:", error);
      alert("Errore nella richiesta al server.");
    });
}
function validaCampoNome(input) {
  const parole = input.value.trim().split(/\s+/);
  const valide = parole.filter((p) => p.length >= 2);
  if (valide.length >= 2) {
    input.setCustomValidity("");
  } else {
    input.setCustomValidity("Inserisci Nome e Cognome");
  }
}

// Formattazione e validazione automatica live per prenotatore
document
  .getElementById("prenotatoreNome")
  .addEventListener("input", function () {
    this.value = this.value
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    validaCampoNome(this); // ✅ aggiunto
  });

["prenotatoreEmail", "prenotatoreEmailConferma"].forEach((id) => {
  const campo = document.getElementById(id);
  campo.addEventListener("input", () => {
    campo.value = campo.value.toLowerCase(); // 🔡 forza minuscolo
    campo.setCustomValidity(""); // ✅ reset validazione se corregge
  });
});

function aggiornaBarraAvanzamento(percentuale, fase) {
  const barra = document.getElementById("barraInterna");
  const barraAttesa = document.getElementById("barraAttesa");
  const barraMessaggio = document.getElementById("barraMessaggio");
  const confermaMsg = document.getElementById("messaggioConferma");

  // Mostra comunque la barra se per qualche motivo non lo è
  if (barraAttesa && barraAttesa.style.display !== "block") {
    barraAttesa.style.display = "block";
  }

  if (barra) barra.style.width = `${percentuale}%`;

  if (barraMessaggio && fase) {
    const testi = {
      "salvataggio-db": "Salvataggio prenotazione...",
      "generazione-pdf": "Generazione biglietti in corso...",
      "invio-email": "Invio dei biglietti tramite email...",
      "completata": "Completata! Email inviata ✅",
    };
    barraMessaggio.innerHTML = testi[fase] || "Elaborazione in corso...";
  }

if (percentuale === 100) {
  clearInterval(window.animazionePuntini);

  setTimeout(() => {
    barraAttesa.style.display = "none";
    document.body.style.pointerEvents = "auto";

    alert("✅ Prenotazione confermata!\nControlla la tua email per verificare se hai ricevuto i PDF.\nSe non la trovi, controlla nella SPAM.");

    // 🔁 Ricarica completa della pagina → chiude WebSocket + svuota localStorage
    window.location.reload();
  }, 500);
}
}

window.inviaEmailConferma = inviaEmailConferma;

function mostraOverlayBloccaInterazioni() {
  const overlay = document.getElementById("overlayBloccaInterazioni");
  if (overlay) overlay.style.display = "block";
}

function nascondiOverlayBloccaInterazioni() {
  const overlay = document.getElementById("overlayBloccaInterazioni");
  if (overlay) overlay.style.display = "none";
}