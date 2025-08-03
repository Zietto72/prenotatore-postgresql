function randomNome() {
  const nomi = ["Anna", "Luca", "Giulia", "Marco", "Elisa", "Davide", "Sara", "Paolo"];
  const cognomi = ["Rossi", "Verdi", "Bianchi", "Russo", "Conti", "Ferrari"];
  return `${nomi[Math.floor(Math.random() * nomi.length)]} ${cognomi[Math.floor(Math.random() * cognomi.length)]}`;
}

function generaCodicePosto(i) {
  const file = ['A','B','C','D','E','F','G','H'];
  const numero = Math.floor(Math.random() * 20) + 1;
  return `${file[i % file.length]}${numero}`;
}

module.exports = {
  genera8Posti: function (userContext, events, done) {
    const nome = randomNome();
    const spettatori = [];

    for (let i = 0; i < 8; i++) {
      spettatori.push({
        nome: randomNome(),
        posto: "PLATEA_" + generaCodicePosto(i)
      });
    }

    userContext.vars.nome = nome;
    userContext.vars.email = nome.replace(/\s/g, '').toLowerCase() + "@test.com";
    userContext.vars.telefono = "1234567890";
    userContext.vars.spettatori = spettatori;

    return done();
  }
};