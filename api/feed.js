const { coordenadasValidas, distanciaMetros } = require('../lib/localizacao');
const {
  authenticate,
  enforceRateLimit,
  noStore,
  serverError,
  serviceClient,
} = require('../lib/api-security');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);

  try {
    const sb = serviceClient();
    const auth = await authenticate(req, res, sb);
    if (!auth) return;
    if (!enforceRateLimit(req, res, 'feed', { limit: 120, windowMs: 60_000 }, auth.user.id)) return;

    const { data: profile, error: profileError } = await sb
      .from('usuarios')
      .select('id, cidade, lat, lon, raio')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !coordenadasValidas(profile)) return res.json({ posts: [] });

    const radius = Math.min(Math.max(Number(profile.raio) || 150, 50), 500);
    const { data: rows, error } = await sb
      .from('posts')
      .select('id, usuario_id, apelido_autor, tipo, texto, foto_url, lat, lon, apoios, criado_em')
      .eq('cidade', profile.cidade)
      .order('criado_em', { ascending: false })
      .limit(500);
    if (error) throw error;

    const visible = (rows || []).map(post => ({
      ...post,
      distancia_metros: distanciaMetros(profile.lat, profile.lon, post.lat, post.lon),
    })).filter(post => post.distancia_metros !== null && post.distancia_metros <= radius);

    const postIds = visible.map(post => post.id);
    const authorIds = [...new Set(visible.map(post => post.usuario_id).filter(Boolean))];
    const [commentsResult, profilesResult] = await Promise.all([
      postIds.length
        ? sb.from('comentarios').select('id, post_id, usuario_id, apelido_autor, texto, criado_em').in('post_id', postIds).order('criado_em', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      authorIds.length
        ? sb.from('usuarios').select('id, foto_url').in('id', authorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (commentsResult.error) throw commentsResult.error;

    const commentAuthorIds = [...new Set((commentsResult.data || []).map(item => item.usuario_id).filter(Boolean))];
    let commentProfiles = [];
    if (commentAuthorIds.length) {
      const result = await sb.from('usuarios').select('id, foto_url').in('id', commentAuthorIds);
      if (result.error) throw result.error;
      commentProfiles = result.data || [];
    }
    if (profilesResult.error) throw profilesResult.error;

    const photos = new Map([...(profilesResult.data || []), ...commentProfiles]
      .map(profileRow => [profileRow.id, safePhotoUrl(profileRow.foto_url)]));
    const commentsByPost = new Map();
    for (const comment of commentsResult.data || []) {
      const list = commentsByPost.get(String(comment.post_id)) || [];
      list.push({
        id: comment.id,
        usuario_id: comment.usuario_id,
        apelido_autor: comment.apelido_autor,
        texto: comment.texto,
        criado_em: comment.criado_em,
        foto_autor_url: photos.get(comment.usuario_id) || null,
      });
      commentsByPost.set(String(comment.post_id), list);
    }

    return res.json({
      posts: visible.map(({ lat, lon, ...post }) => ({
        ...post,
        foto_url: safePhotoUrl(post.foto_url),
        foto_autor_url: photos.get(post.usuario_id) || null,
        comentarios: commentsByPost.get(String(post.id)) || [],
      })),
    });
  } catch (error) {
    return serverError(res, 'Feed error:', error);
  }
};

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'xurtdibicsxmouvzfxvb.supabase.co') return null;
    if (!url.pathname.startsWith('/storage/v1/object/public/fotos/')) return null;
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

module.exports._private = { safePhotoUrl };
