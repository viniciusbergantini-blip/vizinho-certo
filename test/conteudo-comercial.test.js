const test = require('node:test');
const assert = require('node:assert/strict');
const { pareceOfertaComercial } = require('../lib/conteudo-comercial');

test('detecta oferta comercial que tenta usar o feed gratuito', () => {
  assert.equal(pareceOfertaComercial('Faço serviços de eletricista. Orçamento pelo WhatsApp (19) 99999-0000'), true);
  assert.equal(pareceOfertaComercial('Vendo marmitas por R$ 20, faço entregas'), true);
  assert.equal(pareceOfertaComercial('Agenda aberta para limpeza e faxina, chama no WhatsApp'), true);
});

test('permite pedido de indicação ou ajuda no feed', () => {
  assert.equal(pareceOfertaComercial('Preciso de eletricista hoje'), false);
  assert.equal(pareceOfertaComercial('Alguém indica uma diarista?'), false);
  assert.equal(pareceOfertaComercial('Onde encontro um bom pintor no bairro?'), false);
});
