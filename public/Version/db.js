// db.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Cartella e file DB
const dataDir = path.join(__dirname, 'data');
const dbFile  = path.join(dataDir, 'booking.sqlite');

// Se non esiste, creala
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Apri (o crea) il database
const db = new sqlite3.Database(dbFile, err => {
  if (err) console.error('❌ Errore DB:', err);
  else console.log('✅ DB SQLite connesso in', dbFile);
});

// Crea le tabelle una volta sola
db.serialize(() => {
  // Dettagli prenotazioni
  db.run(`
    CREATE TABLE IF NOT EXISTS prenotazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      posto TEXT,
      nome TEXT,
      email TEXT,
      telefono TEXT,
      prenotatore TEXT,
      bookingCode TEXT
    )
  `);
  // Solo i posti occupati
  db.run(`
    CREATE TABLE IF NOT EXISTS occupiedSeats (
      posto TEXT PRIMARY KEY
    )
  `);
});

module.exports = db;