function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const PEDIDO = /\b(preciso|procuro|busco|necessito|alguem indica|quem indica|alguma indicacao|onde encontro|conhecem|recomendam)\b/;
const OFERTA = /\b(faco|fazemos|atendo|atendemos|ofereco|oferecemos|trabalho com|prestamos|vendo|vendemos|agenda aberta|orcamento|promocao|desconto|entrega|encomenda)\b/;
const CONTATO = /\b(whats(?:app)?|chama no|fale comigo|entre em contato|orcamento|instagram)\b|(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}|r\$\s*\d/i;
const SERVICO = /\b(encanador|eletricista|diarista|limpeza|faxina|pedreiro|pintor|jardineiro|jardinagem|costureira|marido de aluguel|montador|reparo|manutencao|frete|mudanca|beleza|manicure|cabeleireir|aula|reforco|assistencia tecnica|ar condicionado|comercio|loja|restaurante|produto|servico)\b/;

function pareceOfertaComercial(texto) {
  const t = normalizar(texto);
  if (!t) return false;
  const pedido = PEDIDO.test(t);
  const oferta = OFERTA.test(t);
  const contato = CONTATO.test(t);
  const servico = SERVICO.test(t);
  if (pedido && !oferta && !contato) return false;
  return (oferta && (servico || contato)) || (servico && contato);
}

module.exports = { pareceOfertaComercial };
