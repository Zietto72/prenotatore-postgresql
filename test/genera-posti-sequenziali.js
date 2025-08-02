// test/genera-posti-sequenziali.js

let contatoreGlobale = 0;

module.exports = {
  generaPosti: function (userContext, events, done) {
    const spettatori = [];

    // Ogni utente ottiene 8 posti consecutivi, es: A1-A8, A9-A16, A17-A24, ecc.
    const start = contatoreGlobale * 8 + 1;

    for (let i = 0; i < 8; i++) {
      spettatori.push({
        posto: `A${start + i}`,
        nome: `Spettatore A${start + i}`,
        prezzo: 7.5
      });
    }

    contatoreGlobale++;
    userContext.vars.spettatori = spettatori;
    done();
  }
};