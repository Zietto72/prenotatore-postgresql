const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'booking.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Errore apertura DB evento:', err);
  } else {
    console.log('✅ Database evento connesso.');
  }
});

module.exports = db;