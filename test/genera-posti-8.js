// test/genera-posti-8.js
module.exports = {
  generaPosti: function (userContext, events, done) {
    const postiDisponibili = Array.from({ length: 120 }, (_, i) => `A${i + 1}`);
    const spettatori = [];

    // Pesca 8 posti casuali distinti
    for (let i = 0; i < 8; i++) {
      const index = Math.floor(Math.random() * postiDisponibili.length);
      const posto = postiDisponibili.splice(index, 1)[0];
      spettatori.push({
        posto,
        nome: `Spettatore ${posto}`,
        prezzo: 7.5
      });
    }

    userContext.vars.spettatori = spettatori;
    done();
  }
};