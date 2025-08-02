// test/genera-posti.js
module.exports = {
  generaPosti: function (userContext, events, done) {
    const postiDisponibili = Array.from({ length: 50 }, (_, i) => `A${i + 1}`);
    const spettatori = [];

    while (spettatori.length < 3) {
      const index = Math.floor(Math.random() * postiDisponibili.length);
      const posto = postiDisponibili.splice(index, 1)[0];
      spettatori.push({
        posto,
        nome: `Test ${posto}`,
        prezzo: 7.5
      });
    }

    userContext.vars.spettatori = spettatori;
    return done();
  }
};