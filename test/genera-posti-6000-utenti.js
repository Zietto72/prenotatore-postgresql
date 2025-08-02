// test/genera-posti-6000-utenti.js

function generaPostiCasuali(num = 8) {
  const righe = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const posti = new Set();

  while (posti.size < num) {
    const riga = righe[Math.floor(Math.random() * righe.length)];
    const numero = Math.floor(Math.random() * 12) + 1;
    posti.add(`${riga}${numero}`);
  }

  return Array.from(posti);
}

module.exports = {
  generaPosti: function (userContext, events, done) {
    const index = (userContext.vars.__VU || 0);

    const nome = `Utente${index + 1}`;
    const email = `utente${index + 1}@example.com`;
    const telefono = `333${(index + 1).toString().padStart(7, "0")}`;

    const posti = generaPostiCasuali();
    const spettatori = posti.map((posto, i) => ({
      posto,
      nome: `${nome} - Spettatore ${i + 1}`
    }));

    userContext.vars.spettatori = spettatori;
    userContext.vars.email = email;
    userContext.vars.nome = nome;
    userContext.vars.telefono = telefono;

    return done();
  }
};