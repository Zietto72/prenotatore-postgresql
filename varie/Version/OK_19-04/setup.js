// setup.js - configurazione per server (CommonJS) e client (ES Module)
const showName = "Na Famjia squasi normal";
const showDate = "Sabato 02 Febbraio 2025";
const imgIntest = "http://www.lacalzamaglia.it/wp-content/uploads/2024/06/logo-calza.png";
const notespdf = "Questo documento non ha valore fiscale e non sostituisce il biglietto SIAE; esso è valido solo come documento attestante la prenotazione del posto per lo spettacolo indicato e dovrà essere presentato al momento dell'ingresso prima dell'inizio dello spettacolo e al contempo verrà sostituito dal biglietto SIAE. In caso di mancata presentazione non verrà riconosciuto alcun rimborso";
const emailJsUserId = 'wgOAHSNswOPXrUPY7';
const apiUrl = 'http://localhost:3000';

// Prezzi per zona
const zonePrices = {
  PLATEA: 70.50,
  GALLERIA: 180.00,
  LATERALE_DX: 1.00,
  LATERALE_SX: 1000000
};

// Esportazioni CommonJS (per server)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showName,
    showDate,
    imgIntest,
    notespdf,
    emailJsUserId,
    apiUrl,
    zonePrices
  };
}

// Esportazioni ES Module (per browser)
export {
  showName,
  showDate,
  imgIntest,
  notespdf,
  emailJsUserId,
  apiUrl,
  zonePrices
};
