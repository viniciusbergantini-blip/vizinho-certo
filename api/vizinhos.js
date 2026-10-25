const { coordenadasValidas, distanciaMetros } = require('../lib/localizacao');
const {
  authenticate,
  enforceRateLimit,
  noStore,
  serverError,
  serviceClient,
} = require('../lib/api-security');
const { _private: feedPrivate } = require('./feed');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);

  try {
    const sb = serviceClient();
    const auth = await authenticate(req, res, sb);
    if (!auth) return;
    if (!enforceRateLimit(req, res, 'neighbors', { limit: 60, windowMs: 60_000 }, auth.user.id)) return;

    const { data: profile, error: profileError } = await sb
      .from('usuarios')
      .select('id, cidade, uf, lat, lon, raio')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !coordenadasValidas(profile)) return res.json({ vizinhos: [] });

    const radius = Math.min(Math.max(Number(profile.raio) || 150, 50), 500);
    let query = sb
      .from('usuarios')
      .select('id, apelido, nome, bairro, cidade, foto_url, lat, lon')
      .neq('id', auth.user.id)
      .limit(1000);
    if (profile.cidade) query = query.eq('cidade', profile.cidade);
    if (profile.uf) query = query.eq('uf', profile.uf);
    const { data, error } = await query;
    if (error) throw error;

    const neighbors = (data || []).map(user => ({
      id: user.id,
      apelido: user.apelido || user.nome || 'Vizinho',
      bairro: user.bairro || user.cidade || '',
      foto_url: feedPrivate.safePhotoUrl(user.foto_url),
      distancia_metros: distanciaMetros(profile.lat, profile.lon, user.lat, user.lon),
    })).filter(user => user.distancia_metros !== null && user.distancia_metros <= radius)
      .sort((a, b) => a.distancia_metros - b.distancia_metros)
      .slice(0, 100);

    return res.json({ vizinhos: neighbors });
  } catch (error) {
    return serverError(res, 'Neighbors error:', error);
  }
};
