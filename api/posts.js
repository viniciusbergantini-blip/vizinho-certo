const { coordenadasValidas, distanciaMetros, numeroFinito } = require('../lib/localizacao');
const { notifyNearby, notifyUsers } = require('../lib/push-notifications');
const {
  authenticate,
  cleanText,
  enforceBodyLimit,
  enforceRateLimit,
  enforceTrustedOrigin,
  noStore,
  safeRecordId,
  serverError,
  serviceClient,
} = require('../lib/api-security');

const POST_TYPES = new Set(['problema', 'aviso', 'ajuda', 'info']);

module.exports = async (req, res) => {
  noStore(res);

  try {
    const sb = serviceClient();
    const auth = await authenticate(req, res, sb);
    if (!auth) return;

    if (req.method === 'GET') {
      const view = cleanText(req.query?.view, 20);
      if (view === 'feed') {
        if (!enforceRateLimit(req, res, 'feed', { limit: 120, windowMs: 60_000 }, auth.user.id)) return;
        return getFeed(req, res, sb, auth.user.id);
      }
      if (view === 'vizinhos') {
        if (!enforceRateLimit(req, res, 'neighbors', { limit: 60, windowMs: 60_000 }, auth.user.id)) return;
        return getNeighbors(req, res, sb, auth.user.id);
      }
      return res.status(400).json({ error: 'Visualizacao invalida' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!enforceTrustedOrigin(req, res) || !enforceBodyLimit(req, res)) return;
    if (!enforceRateLimit(req, res, 'posts', { limit: 60, windowMs: 60_000 }, auth.user.id)) return;

    const action = cleanText(req.body?.action, 30);
    if (action === 'create') return createPost(req, res, sb, auth.user.id);
    if (action === 'comment') return createComment(req, res, sb, auth.user.id);
    if (action === 'support') return updateSupport(req, res, sb, auth.user.id);
    if (action === 'delete') return deletePost(req, res, sb, auth.user.id);
    if (action === 'panic') return createPanic(req, res, sb, auth.user.id);
    if (action === 'block') return blockUser(req, res, sb, auth.user.id);
    if (action === 'unblock') return unblockUser(req, res, sb, auth.user.id);
    if (action === 'report') return reportContent(req, res, sb, auth.user.id);
    return res.status(400).json({ error: 'Acao invalida' });
  } catch (error) {
    return serverError(res, 'Posts API error:', error);
  }
};

async function getFeed(req, res, sb, userId) {
  const { data: profile, error: profileError } = await sb
    .from('usuarios')
    .select('id, cidade, lat, lon, raio')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const position = aplicarLocalizacaoTemporaria(req, profile);
  if (!profile || !coordenadasValidas(position)) return res.json({ posts: [] });

  const radius = Math.min(Math.max(Number(profile.raio) || 150, 50), 500);
  const { data: rows, error } = await sb
    .from('posts')
    .select('id, usuario_id, apelido_autor, tipo, texto, foto_url, lat, lon, apoios, criado_em')
    .eq('cidade', profile.cidade)
    .order('criado_em', { ascending: false })
    .limit(500);
  if (error) throw error;

  const blockedIds = await loadBlockedIds(sb, userId);
  const visible = (rows || []).filter(post => !blockedIds.has(String(post.usuario_id))).map(post => ({
    ...post,
    distancia_metros: distanciaMetros(position.lat, position.lon, post.lat, post.lon),
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
  if (profilesResult.error) throw profilesResult.error;

  const commentAuthorIds = [...new Set((commentsResult.data || []).map(item => item.usuario_id).filter(Boolean))];
  let commentProfiles = [];
  if (commentAuthorIds.length) {
    const result = await sb.from('usuarios').select('id, foto_url').in('id', commentAuthorIds);
    if (result.error) throw result.error;
    commentProfiles = result.data || [];
  }

  const photos = new Map([...(profilesResult.data || []), ...commentProfiles]
    .map(profileRow => [profileRow.id, safePhotoUrl(profileRow.foto_url)]));
  const commentsByPost = new Map();
  for (const comment of commentsResult.data || []) {
    if (blockedIds.has(String(comment.usuario_id))) continue;
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
}

async function getNeighbors(req, res, sb, userId) {
  const { data: profile, error: profileError } = await sb
    .from('usuarios')
    .select('id, cidade, uf, lat, lon, raio')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const position = aplicarLocalizacaoTemporaria(req, profile);
  if (!profile || !coordenadasValidas(position)) return res.json({ vizinhos: [] });

  const radius = Math.min(Math.max(Number(profile.raio) || 150, 50), 500);
  let query = sb
    .from('usuarios')
    .select('id, apelido, nome, bairro, cidade, foto_url, lat, lon')
    .neq('id', userId)
    .limit(1000);
  if (profile.cidade) query = query.eq('cidade', profile.cidade);
  if (profile.uf) query = query.eq('uf', profile.uf);
  const { data, error } = await query;
  if (error) throw error;

  const blockedIds = await loadBlockedIds(sb, userId);
  const neighbors = (data || []).filter(user => !blockedIds.has(String(user.id))).map(user => ({
    id: user.id,
    apelido: user.apelido || user.nome || 'Vizinho',
    bairro: user.bairro || user.cidade || '',
    foto_url: safePhotoUrl(user.foto_url),
    distancia_metros: distanciaMetros(position.lat, position.lon, user.lat, user.lon),
  })).filter(user => user.distancia_metros !== null && user.distancia_metros <= radius)
    .sort((a, b) => a.distancia_metros - b.distancia_metros)
    .slice(0, 100);

  return res.json({ vizinhos: neighbors });
}

function aplicarLocalizacaoTemporaria(req, perfil) {
  if (!perfil) return perfil;
  const latitude = numeroFinito(req.headers['x-vizinho-latitude']);
  const longitude = numeroFinito(req.headers['x-vizinho-longitude']);
  if (latitude === null || longitude === null
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return perfil;
  return { ...perfil, lat: latitude, lon: longitude };
}

async function getProfile(sb, userId) {
  const { data, error } = await sb
    .from('usuarios')
    .select('id, nome, apelido, bairro, cidade, cep, lat, lon, raio')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createPost(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'post-create', { limit: 10, windowMs: 10 * 60_000 }, userId)) return;
  const text = cleanText(req.body?.texto, 1000, { multiline: true });
  const type = cleanText(req.body?.tipo, 20);
  const photoUrl = safeOwnedPhotoUrl(req.body?.foto_url, userId);
  if ((!text && !photoUrl) || !POST_TYPES.has(type)) return res.status(400).json({ error: 'Publicacao invalida' });
  if (req.body?.foto_url && !photoUrl) return res.status(400).json({ error: 'Foto invalida' });

  const profile = await getProfile(sb, userId);
  if (!profile || !coordenadasValidas(profile)) return res.status(409).json({ error: 'Atualize seu endereco antes de publicar' });
  if (await reachedPersistentLimit(sb, 'posts', userId, 20, 24 * 60 * 60_000)) {
    return res.status(429).json({ error: 'Limite diario de publicacoes atingido' });
  }
  const post = {
    usuario_id: userId,
    apelido_autor: cleanText(profile.apelido || profile.nome || 'Vizinho', 80),
    tipo: type,
    texto: text,
    foto_url: photoUrl,
    bairro: cleanText(profile.bairro, 100),
    cidade: cleanText(profile.cidade, 100),
    cep: String(profile.cep || '').replace(/\D/g, '').slice(0, 8),
    lat: profile.lat,
    lon: profile.lon,
    apoios: 0,
  };
  const { data, error } = await sb.from('posts').insert(post)
    .select('id, usuario_id, apelido_autor, tipo, texto, foto_url, apoios, criado_em').single();
  if (error) throw error;

  notifyNearby(sb, profile, {
    title: '📢 Nova publicação na sua rua!',
    body: text.slice(0, 80) || 'Um vizinho publicou uma nova foto.',
  }, { excludeUserId: userId }).catch(error => console.error('Post notification error:', error));
  return res.status(201).json({ post: data });
}

async function createComment(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'post-comment', { limit: 30, windowMs: 10 * 60_000 }, userId)) return;
  const postId = safeRecordId(req.body?.post_id);
  const text = cleanText(req.body?.texto, 300, { multiline: true });
  if (!postId || !text) return res.status(400).json({ error: 'Comentario invalido' });

  const [profile, postResult] = await Promise.all([
    getProfile(sb, userId),
    sb.from('posts').select('id, usuario_id, lat, lon').eq('id', postId).maybeSingle(),
  ]);
  if (postResult.error) throw postResult.error;
  if (!profile || !postResult.data || !postVisibleToProfile(postResult.data, profile)) {
    return res.status(404).json({ error: 'Publicacao nao encontrada' });
  }
  if (await usersBlocked(sb, userId, postResult.data.usuario_id)) {
    return res.status(403).json({ error: 'Interacao indisponivel entre estes perfis' });
  }
  if (await reachedPersistentLimit(sb, 'comentarios', userId, 100, 60 * 60_000)) {
    return res.status(429).json({ error: 'Limite de comentarios atingido. Aguarde para continuar.' });
  }

  const comment = {
    post_id: postId,
    usuario_id: userId,
    apelido_autor: cleanText(profile.apelido || profile.nome || 'Vizinho', 80),
    texto: text,
  };
  const { data, error } = await sb.from('comentarios').insert(comment)
    .select('id, post_id, usuario_id, apelido_autor, texto, criado_em').single();
  if (error) throw error;

  if (postResult.data.usuario_id && postResult.data.usuario_id !== userId) {
    notifyUsers(sb, [postResult.data.usuario_id], {
      title: `💬 ${comment.apelido_autor} comentou no seu post`,
      body: text.slice(0, 80),
    }).catch(error => console.error('Comment notification error:', error));
  }
  return res.status(201).json({ comment: data });
}

async function updateSupport(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'post-support', { limit: 120, windowMs: 10 * 60_000 }, userId)) return;
  const postId = safeRecordId(req.body?.post_id);
  const supported = req.body?.supported === true;
  if (!postId) return res.status(400).json({ error: 'Publicacao invalida' });

  const [profile, postResult] = await Promise.all([
    getProfile(sb, userId),
    sb.from('posts').select('id, usuario_id, lat, lon').eq('id', postId).maybeSingle(),
  ]);
  if (postResult.error) throw postResult.error;
  if (!profile || !postResult.data || !postVisibleToProfile(postResult.data, profile)) {
    return res.status(404).json({ error: 'Publicacao nao encontrada' });
  }
  if (await usersBlocked(sb, userId, postResult.data.usuario_id)) {
    return res.status(403).json({ error: 'Interacao indisponivel entre estes perfis' });
  }

  if (supported) {
    const { error } = await sb.from('post_apoios').upsert({ post_id: postId, usuario_id: userId }, { onConflict: 'post_id,usuario_id' });
    if (error) throw error;
  } else {
    const { error } = await sb.from('post_apoios').delete().eq('post_id', postId).eq('usuario_id', userId);
    if (error) throw error;
  }

  const { count, error: countError } = await sb.from('post_apoios')
    .select('post_id', { count: 'exact', head: true }).eq('post_id', postId);
  if (countError) throw countError;
  const total = Math.max(0, Number(count || 0));
  const { error: updateError } = await sb.from('posts').update({ apoios: total }).eq('id', postId);
  if (updateError) throw updateError;
  return res.json({ supported, apoios: total });
}

async function deletePost(req, res, sb, userId) {
  const postId = safeRecordId(req.body?.post_id);
  if (!postId) return res.status(400).json({ error: 'Publicacao invalida' });
  const { data: post, error: findError } = await sb.from('posts')
    .select('id').eq('id', postId).eq('usuario_id', userId).maybeSingle();
  if (findError) throw findError;
  if (!post) return res.status(403).json({ error: 'Voce so pode excluir suas publicacoes' });

  const supports = await sb.from('post_apoios').delete().eq('post_id', postId);
  if (supports.error) throw supports.error;
  const comments = await sb.from('comentarios').delete().eq('post_id', postId);
  if (comments.error) throw comments.error;
  const deleted = await sb.from('posts').delete().eq('id', postId).eq('usuario_id', userId);
  if (deleted.error) throw deleted.error;
  return res.json({ deleted: true });
}

async function createPanic(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'panic', { limit: 1, windowMs: 10 * 60_000 }, userId)) return;
  const profile = await getProfile(sb, userId);
  if (!profile || !coordenadasValidas(profile)) return res.status(409).json({ error: 'Atualize seu endereco antes de enviar um alerta' });
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: recentPanics, error: panicCountError } = await sb.from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('tipo', 'aviso')
    .like('texto', '🆘 ALERTA DE EMERGÊNCIA%')
    .gte('criado_em', since);
  if (panicCountError) throw panicCountError;
  if (Number(recentPanics || 0) > 0) {
    return res.status(429).json({ error: 'Um alerta ja foi enviado recentemente. Aguarde antes de repetir.' });
  }
  const name = cleanText(profile.apelido || profile.nome || 'Um vizinho', 80);
  const text = `🆘 ALERTA DE EMERGÊNCIA — ${name} acionou o botão de pânico nas proximidades. Fique atento e verifique se pode ajudar. Polícia 190 | SAMU 192 | Bombeiros 193.`;
  const { data, error } = await sb.from('posts').insert({
    usuario_id: userId,
    apelido_autor: name,
    tipo: 'aviso',
    texto: text,
    bairro: cleanText(profile.bairro, 100),
    cidade: cleanText(profile.cidade, 100),
    cep: String(profile.cep || '').replace(/\D/g, '').slice(0, 8),
    lat: profile.lat,
    lon: profile.lon,
    apoios: 0,
  }).select('id').single();
  if (error) throw error;

  notifyNearby(sb, profile, {
    title: '🆘 ALERTA DE EMERGÊNCIA!',
    body: `${name} acionou o botão de pânico nas proximidades.`,
  }, { excludeUserId: userId }).catch(error => console.error('Panic notification error:', error));
  return res.status(201).json({ post_id: data.id });
}

async function blockUser(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'user-block', { limit: 30, windowMs: 10 * 60_000 }, userId)) return;
  const targetId = safeRecordId(req.body?.target_user_id);
  if (!targetId || targetId === userId) return res.status(400).json({ error: 'Perfil invalido para bloqueio' });
  const { data: target, error: targetError } = await sb.from('usuarios').select('id').eq('id', targetId).maybeSingle();
  if (targetError) throw targetError;
  if (!target) return res.status(404).json({ error: 'Perfil nao encontrado' });
  const { error } = await sb.from('bloqueios_usuarios').upsert(
    { bloqueador_id: userId, bloqueado_id: targetId },
    { onConflict: 'bloqueador_id,bloqueado_id' }
  );
  if (error) throw error;
  return res.json({ blocked: true, target_user_id: targetId });
}

async function unblockUser(req, res, sb, userId) {
  const targetId = safeRecordId(req.body?.target_user_id);
  if (!targetId) return res.status(400).json({ error: 'Perfil invalido' });
  const { error } = await sb.from('bloqueios_usuarios').delete()
    .eq('bloqueador_id', userId).eq('bloqueado_id', targetId);
  if (error) throw error;
  return res.json({ blocked: false, target_user_id: targetId });
}

async function reportContent(req, res, sb, userId) {
  if (!enforceRateLimit(req, res, 'content-report', { limit: 20, windowMs: 24 * 60 * 60_000 }, userId)) return;
  const contentType = cleanText(req.body?.content_type, 20).toLowerCase();
  const contentId = safeRecordId(req.body?.content_id);
  const reason = cleanText(req.body?.reason, 500, { multiline: true });
  if (!['post', 'comentario', 'perfil', 'anuncio'].includes(contentType) || !contentId || reason.length < 3) {
    return res.status(400).json({ error: 'Denuncia incompleta' });
  }

  const lookup = {
    post: { table: 'posts', owner: 'usuario_id' },
    comentario: { table: 'comentarios', owner: 'usuario_id' },
    perfil: { table: 'usuarios', owner: 'id' },
    anuncio: { table: 'anuncios', owner: 'usuario_id' },
  }[contentType];
  const fields = lookup.owner === 'id' ? 'id' : `id, ${lookup.owner}`;
  const { data: content, error: contentError } = await sb.from(lookup.table)
    .select(fields).eq('id', contentId).maybeSingle();
  if (contentError) throw contentError;
  if (!content) return res.status(404).json({ error: 'Conteudo nao encontrado' });
  const reportedId = content[lookup.owner];
  if (reportedId === userId) return res.status(400).json({ error: 'Nao e possivel denunciar seu proprio conteudo' });

  const { error } = await sb.from('denuncias_conteudo').upsert({
    denunciante_id: userId,
    denunciado_id: reportedId,
    tipo_conteudo: contentType,
    conteudo_id: String(contentId),
    motivo: reason,
    status: 'pendente',
    analisado_em: null,
  }, { onConflict: 'denunciante_id,tipo_conteudo,conteudo_id' });
  if (error) throw error;
  return res.status(201).json({ reported: true });
}

async function loadBlockedIds(sb, userId) {
  const { data, error } = await sb.from('bloqueios_usuarios')
    .select('bloqueador_id, bloqueado_id')
    .or(`bloqueador_id.eq.${userId},bloqueado_id.eq.${userId}`);
  if (error) throw error;
  const ids = new Set();
  for (const row of data || []) {
    ids.add(String(row.bloqueador_id === userId ? row.bloqueado_id : row.bloqueador_id));
  }
  return ids;
}

async function usersBlocked(sb, firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) return false;
  const blocked = await loadBlockedIds(sb, firstId);
  return blocked.has(String(secondId));
}

function postVisibleToProfile(post, profile) {
  if (post.usuario_id === profile.id) return true;
  if (!coordenadasValidas(post) || !coordenadasValidas(profile)) return false;
  const radius = Math.min(Math.max(Number(profile.raio) || 150, 50), 500);
  const distance = distanciaMetros(profile.lat, profile.lon, post.lat, post.lon);
  return distance !== null && distance <= radius;
}

function safeOwnedPhotoUrl(value, userId) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.hostname !== 'xurtdibicsxmouvzfxvb.supabase.co') return null;
    const prefix = `/storage/v1/object/public/fotos/posts/${encodeURIComponent(userId)}/`;
    return url.pathname.startsWith(prefix) ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

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

async function reachedPersistentLimit(sb, table, userId, limit, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await sb.from(table)
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .gte('criado_em', since);
  if (error) throw error;
  return Number(count || 0) >= limit;
}

module.exports._private = { POST_TYPES, loadBlockedIds, postVisibleToProfile, reachedPersistentLimit, safeOwnedPhotoUrl, safePhotoUrl, usersBlocked };
