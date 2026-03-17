export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  
  const texto = req.body?.texto || '';
  const bairro = req.body?.bairro || 'meu bairro';
  const apoios = req.body?.apoios || 0;
  
  if (!texto) {
    res.status(400).json({ error: 'Texto não informado', body: req.body });
    return;
  }

  try {
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
    const texto_gerado = data.choices?.[0]?.message?.content;
    
    if (texto_gerado) {
      res.status(200).json({ texto: texto_gerado });
    } else {
      res.status(500).json({ error: 'Sem resposta do Groq', groq_response: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
