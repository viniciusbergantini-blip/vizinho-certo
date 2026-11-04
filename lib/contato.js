function normalizarTelefoneBrasil(valor) {
  let digitos = String(valor || '').replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  return /^\d{10,11}$/.test(digitos) ? digitos : '';
}

module.exports = { normalizarTelefoneBrasil };
