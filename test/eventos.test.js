const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularJanela,
  eventoDentroDaJanela,
  normalizarPeriodo,
  validarSugestaoEvento,
} = require('../lib/eventos');

test('normaliza períodos desconhecidos para sete dias', () => {
  assert.equal(normalizarPeriodo('30dias'), '30dias');
  assert.equal(normalizarPeriodo('qualquer'), '7dias');
});

test('calcula o dia de hoje no fuso de São Paulo', () => {
  const janela = calcularJanela('hoje', new Date('2026-10-18T15:00:00.000Z'));
  assert.equal(janela.inicio.toISOString(), '2026-10-18T03:00:00.000Z');
  assert.equal(janela.fim.toISOString(), '2026-10-19T03:00:00.000Z');
});

test('aceita sugestão válida e normaliza campos', () => {
  const resultado = validarSugestaoEvento({
    titulo: ' Feira de artesanato ',
    categoria: 'Feira',
    inicio_em: '2026-10-20T12:00:00.000Z',
    local_nome: 'Praça Central',
    gratuito: true,
    fonte_url: 'https://prefeitura.example/evento',
  }, new Date('2026-10-18T12:00:00.000Z'));

  assert.equal(resultado.ok, true);
  assert.equal(resultado.evento.titulo, 'Feira de artesanato');
  assert.equal(resultado.evento.preco_texto, null);
});

test('rejeita preço ausente, protocolo inseguro e data passada', () => {
  const resultado = validarSugestaoEvento({
    titulo: 'Show local',
    categoria: 'Show',
    inicio_em: '2026-10-10T12:00:00.000Z',
    local_nome: 'Teatro',
    gratuito: false,
    fonte_url: 'javascript:alert(1)',
  }, new Date('2026-10-18T12:00:00.000Z'));

  assert.equal(resultado.ok, false);
  assert.match(resultado.erros.join(' '), /preço/i);
  assert.match(resultado.erros.join(' '), /http/i);
  assert.match(resultado.erros.join(' '), /futuro/i);
});

test('mantém eventos em andamento dentro da janela', () => {
  const janela = calcularJanela('hoje', new Date('2026-10-18T15:00:00.000Z'));
  assert.equal(eventoDentroDaJanela({
    inicio_em: '2026-10-17T20:00:00.000Z',
    fim_em: '2026-10-18T20:00:00.000Z',
  }, janela), true);
});
