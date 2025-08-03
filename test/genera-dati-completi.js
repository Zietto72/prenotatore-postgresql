const eventi = [
  "2025-07-28_Prova",
  "2025-08-01_AltroEvento",
  "2025-08-03_EventoSpeciale"
];

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
  generaDatiUtente: function (userContext, events, done) {
    const nome = randomNome();
    const spettatori = [];

    for (let i = 0; i < 4; i++) {
      spettatori.push({
        nome: randomNome(),
        posto: "PLATEA_" + generaCodicePosto(i)
      });
    }

    const evento = eventi[Math.floor(Math.random() * eventi.length)];

    userContext.vars.nome = nome;
    userContext.vars.email = nome.replace(/\s/g, '').toLowerCase() + "@test.com";
    userContext.vars.telefono = "3333333333";
    userContext.vars.spettatori = spettatori;
    userContext.vars.evento = evento;

    return done();
  }
};