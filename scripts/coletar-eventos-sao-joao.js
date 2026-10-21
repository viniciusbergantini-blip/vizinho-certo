#!/usr/bin/env node

const { coletarEventosSaoJoaoSemSalvar } = require('../lib/eventos-coletor-sao-joao');

async function main() {
  const coleta = await coletarEventosSaoJoaoSemSalvar();
  process.stdout.write(JSON.stringify({
    eventos: coleta.eventos,
    diagnostico: {
      calendario: coleta.calendario,
      noticias: coleta.noticias,
      falhas: coleta.falhas,
    },
  }));
}

main().catch(error => {
  console.error('[eventos:sao-joao] Coleta externa falhou', error);
  process.exitCode = 1;
});
