const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xurtdibicsxmouvzfxvb.supabase.co';
const CITIES = Object.freeze({
  geral: null,
  saojoao: 'São João da Boa Vista',
  maringa: 'Maringá',
  londrina: 'Londrina',
  indaiatuba: 'Indaiatuba',
});

module.exports = async function publicStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Estatísticas indisponíveis' });

  const cityKey = normalizeCityKey(req.query?.city);
  const cityName = CITIES[cityKey];
  const sb = createClient(SUPABASE_URL, serviceKey);

  const totalQuery = sb.from('usuarios').select('id', { count: 'exact', head: true });
  const cityQuery = cityName
    ? sb.from('usuarios').select('id', { count: 'exact', head: true }).eq('cidade', cityName)
    : Promise.resolve({ count: null, error: null });
  const [totalResult, cityResult] = await Promise.all([totalQuery, cityQuery]);

  if (totalResult.error || cityResult.error) {
    console.error('Public stats error:', totalResult.error || cityResult.error);
    return res.status(500).json({ error: 'Estatísticas indisponíveis' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  return res.json({
    city: cityKey,
    registered_total: roundPublicCount(totalResult.count),
    registered_city: roundPublicCount(cityResult.count),
  });
};

function normalizeCityKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CITIES, key) ? key : 'geral';
}

function roundPublicCount(value) {
  const count = Number(value || 0);
  return count >= 10 ? Math.floor(count / 10) * 10 : 0;
}

module.exports._private = { CITIES, normalizeCityKey, roundPublicCount };
