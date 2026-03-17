export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { texto, bairro, apoios } = req.body;
    const prompt = `Você ajuda moradores brasileiros a redigirem pedidos formais para a prefeitura.

Relato do morador (bairro: ${bairro}): "${texto}"${apoios > 0 ? ` Este problema tem ${apoios} vizinhos apoiando.` : ''}

Redija um pedido formal, direto e educado com:
- Saudação ao órgão competente
- Descrição clara do problema e localização
- ${apoios > 0 ? 'Mencione como demanda coletiva com ' + apoios + ' moradores' : 'Solicitação objetiva'}
- Prazo para resolução
- Encerramento cordial

Máximo 180 palavras. Apenas o corpo do texto, sem título.`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7
      })
    });
    const data = await resp.json();
    const texto_gerado = data.choices?.[0]?.message?.content || 'Erro ao gerar texto.';
    res.status(200).json({ texto: texto_gerado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
