// test/genera-posti-20-utenti.js

const nomi = [
  "Mario", "Lucia", "Enrico", "Sara", "Giulia",
  "Davide", "Chiara", "Luca", "Paola", "Francesco",
  "Anna", "Marco", "Elena", "Giorgio", "Valentina",
  "Stefano", "Laura", "Matteo", "Marta", "Antonio",
  "Nicole", "Daniele", "Silvia", "Fabio", "Ilaria",
  "Tommaso", "Angela", "Federico", "Beatrice", "Simone",
  "Roberta", "Gabriele", "Caterina", "Cristian", "Rita",
  "Emanuele", "Noemi", "Alessandro", "Teresa", "Andrea"
];

// funzione che genera posti casuali
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
    const index = userContext.vars.__VU % nomi.length;
    const nome = nomi[index];
    const email = `${nome.toLowerCase()}${index + 1}@example.com`;
    const telefono = `33300000${index.toString().padStart(2, '0')}`;

    const posti = generaPostiCasuali();
    const spettatori = posti.map((posto, i) => ({
      posto,
      nome: `${nome} ${i + 1}`
    }));

    userContext.vars.spettatori = spettatori;
    userContext.vars.email = email;
    userContext.vars.nome = nome;
    userContext.vars.telefono = telefono;

    return done();
  }
};