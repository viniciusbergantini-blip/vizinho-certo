function normalizeSubscription(value) {
  const sub = typeof value === 'string' ? JSON.parse(value) : value;
  const endpoint = new URL(sub?.endpoint);
  const host = endpoint.hostname;
  const trusted = host === 'fcm.googleapis.com' || host === 'android.googleapis.com'
    || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com')
    || host.endsWith('.notify.windows.com');
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || !trusted
    || !/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(sub?.keys?.p256dh || '')
    || !/^[A-Za-z0-9_-]{20,30}={0,2}$/.test(sub?.keys?.auth || '')) throw new Error('Invalid subscription');
  return JSON.stringify({ endpoint: endpoint.href, expirationTime: sub.expirationTime || null,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

async function installationHandler(req,res,sb,userId,installationId,token) {
  const action=req.body.action;
  if(action==='push-recovery-report'){
    const stage=['permission','service_worker','status','unsubscribe','subscribe','save'].includes(req.body.stage)?req.body.stage:'unknown';
    const error_name=['Error','NotAllowedError','AbortError','InvalidStateError','NetworkError','SecurityError','NotSupportedError','TypeError'].includes(req.body.error_name)?req.body.error_name:'other';
    const permission=['granted','denied','default'].includes(req.body.permission)?req.body.permission:'unknown';
    console.info('push_recovery_failed',JSON.stringify({recipient_id:userId,installation_id:installationId,stage,error_name,permission}));
    return res.json({received:true});
  }
  if(action==='push-status'){
    const [settings,subscription]=await Promise.all([
      sb.from('push_installation_settings').select('enabled,automaticas,plataforma')
        .eq('usuario_id',userId).eq('installation_id',installationId).maybeSingle(),
      sb.from('push_tokens').select('token,automaticas,plataforma')
        .eq('usuario_id',userId).eq('installation_id',installationId).maybeSingle(),
    ]);
    if(settings.error) throw settings.error;
    if(subscription.error) throw subscription.error;
    if(!settings.data){
      // Read-only migration of an existing subscription; recovery never enables an unknown install.
      let legacy=null;
      if(token){
        const result=await sb.from('push_tokens').select('token,automaticas,plataforma').eq('usuario_id',userId).eq('token',token).maybeSingle();
        if(result.error) throw result.error;
        legacy=result.data;
      }
      return res.json({enabled:Boolean(legacy),registered:Boolean(legacy),automaticas:legacy?.automaticas===true,legacy:Boolean(legacy)});
    }
    const enabled=settings.data.enabled===true;
    const registered=enabled&&Boolean(token)&&subscription.data?.token===token;
    return res.json({enabled,registered,automaticas:settings.data.automaticas===true,needs_reconnect:enabled&&!registered,
      renew_subscription:enabled&&Boolean(token)&&!subscription.data});
  }
  const actions={'push-register':'register','push-recover':'recover','push-preferences':'preferences','push-unregister':'disable'};
  const command=actions[action];
  if(!command) return res.status(400).json({error:'Ação de notificações inválida.'});
  if(['register','recover'].includes(command)&&!token) return res.status(400).json({error:'Inscrição de notificações necessária.'});
  if(command==='preferences'&&typeof req.body.enabled!=='boolean') return res.status(400).json({error:'Preferência inválida.'});
  const {data,error}=await sb.rpc('configure_push_installation',{
    p_usuario_id:userId,p_installation_id:installationId,p_token:token,
    p_plataforma:req.body.platform==='android'?'android':'web',p_action:command,
    p_automaticas:command==='preferences'?req.body.enabled:null,
  });
  if(error?.code==='22023') return res.status(409).json({error:error.message});
  if(error) throw error;
  return res.json(data);
}

module.exports = async function notificationHandler(req, res, sb, userId) {
  const action = req.body.action;
  if (action === 'push-test' || action === 'push-test-sos') return res.status(410).json({ error: 'Os testes de notificação foram removidos. Atualize o aplicativo.' });
  const installationId=req.body.installation_id;
  if(installationId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)){
    return res.status(400).json({error:'Identificação do aparelho inválida.'});
  }
  let token;
  try { token = installationId&&!req.body.subscription?null:normalizeSubscription(req.body?.subscription); }
  catch { return res.status(400).json({ error: 'Inscrição de notificações inválida.' }); }
  if(installationId) return installationHandler(req,res,sb,userId,installationId,token);
  if (action === 'push-register') {
    const { data: existing, error: lookupError } = await sb.from('push_tokens')
      .select('automaticas,plataforma').eq('usuario_id', userId).eq('token', token).maybeSingle();
    if (lookupError) throw lookupError;
    const platform = req.body.platform === 'android' ? 'android' : (existing?.plataforma || 'web');
    const { error: cleanupError } = await sb.from('push_tokens').delete().eq('token', token).neq('usuario_id', userId);
    if (cleanupError) throw cleanupError;
    const automaticas = existing?.automaticas === true;
    const { error } = await sb.from('push_tokens').upsert({ usuario_id: userId, token,
      plataforma: platform, automaticas }, { onConflict: 'usuario_id,token' });
    if (error) throw error;
    return res.json({ registered: true, automaticas });
  }
  const { data: own, error } = await sb.from('push_tokens').select('id,token,plataforma,automaticas')
    .eq('usuario_id', userId).eq('token', token).maybeSingle();
  if (error) throw error;
  if (action === 'push-status') return res.json({ registered: Boolean(own), automaticas: own?.automaticas === true });
  if (action === 'push-unregister' && !own) return res.json({ registered: false });
  if (!own) return res.status(404).json({ error: 'Ative as notificações neste aparelho primeiro.' });
  if (action === 'push-preferences') {
    if (own.plataforma !== 'android') return res.status(409).json({ error: 'O resumo está disponível no app Android.' });
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'Preferência inválida.' });
    const result = await sb.from('push_tokens').update({ automaticas: req.body.enabled }).eq('id', own.id).eq('usuario_id', userId);
    if (result.error) throw result.error;
    return res.json({ automaticas: req.body.enabled });
  }
  if (action === 'push-unregister') {
    const result = await sb.from('push_tokens').delete().eq('id', own.id).eq('usuario_id', userId);
    if (result.error) throw result.error;
    return res.json({ registered: false });
  }
  return res.status(400).json({ error: 'Ação de notificações inválida.' });
};
module.exports.normalizeSubscription = normalizeSubscription;
