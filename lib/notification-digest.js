const { distanciaMetros, numeroFinito } = require('./localizacao');
const { sendTokens } = require('./push-notifications');
const { verificarTokenGitHubActions, REPOSITORY } = require('./github-oidc');
const { bearerToken, serviceClient } = require('./api-security');

function eligiblePosts(profile, posts, blocks, now) {
  const radius = Math.min(Math.max(numeroFinito(profile.raio) || 150, 50), 500);
  const cutoff = now.getTime() - 24 * 60 * 60_000;
  const blocked = new Set();
  for (const b of blocks) {
    if (b.bloqueador_id === profile.id) blocked.add(b.bloqueado_id);
    if (b.bloqueado_id === profile.id) blocked.add(b.bloqueador_id);
  }
  return posts.filter(p => {
    const created = new Date(p.criado_em).getTime();
    if (p.usuario_id === profile.id || blocked.has(p.usuario_id) || p.cidade !== profile.cidade
      || String(p.texto || '').startsWith('🆘') || !Number.isFinite(created) || created < cutoff || created > now.getTime()) return false;
    const distance = distanciaMetros(profile.lat, profile.lon, p.lat, p.lon);
    return distance !== null && distance <= radius;
  });
}

async function runDigest(sb, { now = new Date(), dryRun = false, deliver = sendTokens } = {}) {
  // Repeated/manual invocations cannot send at night or create a second daily digest.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour < 18 || hour >= 21) return { sent: 0, skipped: 'outside_window' };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const { data: tokens, error } = await sb.from('push_tokens').select('id,token,usuario_id,installation_id')
    .eq('automaticas', true).limit(1000);
  if (error) throw error;
  if (!tokens?.length) return { sent: 0, eligible: 0 };
  const ids = [...new Set(tokens.map(t => t.usuario_id))];
  const [users, posts, blocks] = await Promise.all([
    sb.from('usuarios').select('id,cidade,lat,lon,raio').in('id', ids),
    sb.from('posts').select('id,usuario_id,cidade,lat,lon,texto,criado_em')
      .gte('criado_em', new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).order('criado_em', { ascending: false }).limit(1000),
    sb.from('bloqueios_usuarios').select('bloqueador_id,bloqueado_id')
      .or(`bloqueador_id.in.(${ids.join(',')}),bloqueado_id.in.(${ids.join(',')})`),
  ]);
  for (const result of [users, posts, blocks]) if (result.error) throw result.error;
  let sent = 0, eligible = 0;
  for (const user of users.data || []) {
    const nearby = eligiblePosts(user, posts.data || [], blocks.data || [], now);
    if (!nearby.length) continue;
    eligible++;
    if (dryRun) continue;
    const claim = await sb.from('push_digest_deliveries').insert({ usuario_id: user.id, dia: date, status: 'claimed' });
    if (claim.error?.code === '23505') continue;
    if (claim.error) throw claim.error;
    // Claim before send: a crash or overlapping schedule cannot duplicate a digest.
    const result = await deliver(sb, tokens.filter(t => t.usuario_id === user.id), {
      title: '🏘️ Novidades perto de você',
      body: `${nearby.length} nova(s) publicação(ões) na sua vizinhança hoje. Abra o Vizinho Certo para acompanhar.`,
      tag: `vc-digest-${date}`,
    });
    const updated = await sb.from('push_digest_deliveries').update({ status: result.sent ? 'sent' : 'failed', aparelhos: result.sent })
      .eq('usuario_id', user.id).eq('dia', date);
    if (updated.error) throw updated.error;
    sent += result.sent;
  }
  return { sent, eligible, dryRun };
}

async function handleDigest(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await verificarTokenGitHubActions(bearerToken(req), {
      audience: 'vizinho-certo-notificacoes',
      workflowRef: `${REPOSITORY}/.github/workflows/notificacoes-android.yml@refs/heads/main`,
    });
  } catch { return res.status(401).json({ error: 'Agendamento não autorizado.' }); }
  return res.json(await runDigest(serviceClient(), { dryRun: req.body?.dryRun === true }));
}
module.exports = { runDigest, eligiblePosts, handleDigest };
