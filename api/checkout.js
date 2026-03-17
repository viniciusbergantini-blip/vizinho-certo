export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { nome, tipo, dias, preco, icon, desc, tel, retorno } = req.body;
    const planos = { 10: 'Plano Rua 10 dias', 20: 'Plano Bairro 20 dias', 30: 'Plano Cidade 30 dias' };
    const body = {
      items: [{ title: planos[dias] + ' — ' + nome, quantity: 1, unit_price: preco / 100, currency_id: 'BRL' }],
      back_urls: {
        success: retorno + '?pg=ok&nome=' + encodeURIComponent(nome) + '&tipo=' + encodeURIComponent(tipo) + '&desc=' + encodeURIComponent(desc) + '&tel=' + encodeURIComponent(tel) + '&icon=' + encodeURIComponent(icon) + '&dias=' + dias,
        failure: retorno + '?pg=err',
        pending: retorno + '?pg=pend'
      },
      auto_return: 'approved',
      statement_descriptor: 'VIZINHO CERTO'
    };
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (data.init_point) {
      res.status(200).json({ url: data.init_point });
    } else {
      res.status(500).json({ error: 'Sem link de pagamento', detail: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
