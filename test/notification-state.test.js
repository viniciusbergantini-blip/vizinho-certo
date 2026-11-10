const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');
const code=html.slice(html.indexOf('let registroPushEmAndamento='),html.indexOf('function atualizarEstadoRede()'));

function setup({storage=new Map(),subscribed=false,registered=false,enabled=registered,automaticas=false,permission='default',server=null}={}){
  server=server||{registered,enabled,automaticas};
  const nodes=new Map(),calls=[],history=[],controls={failStatus:false,failRegister:false,failRecover:false};
  const counts={subscribes:0,unsubscribes:0,permissionRequests:0};
  const node=id=>{if(!nodes.has(id)){
    let value='';const el={disabled:false,checked:false};
    Object.defineProperty(el,'textContent',{get:()=>value,set:v=>{value=v;history.push({id,value:v});}});nodes.set(id,el);
  }return nodes.get(id);};
  let subscriptionSequence=0;
  const makeSub=()=>{const endpoint='test-'+(++subscriptionSequence);return {toJSON:()=>({endpoint}),unsubscribe:async()=>{counts.unsubscribes++;sub=null;return true;}};};
  let sub=subscribed?makeSub():null;
  const reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>{counts.subscribes++;return sub=makeSub();},permissionState:async()=>controls.pushPermission||notification.permission}};
  const notification={permission,requestPermission:async()=>{counts.permissionRequests++;return notification.permission='granted';}};
  const context={E:{userId:'reader'},VC_PLAY_STORE_MODE:true,Notification:notification,
    window:{Notification:notification,PushManager:function(){},location:{search:'?vc_android_notifications=0'},crypto:{randomUUID:()=> 'f8ca1e50-317e-4d97-bcca-269b1ac5e481'}},
    navigator:{userAgent:'Android',serviceWorker:{register:async()=>reg,ready:Promise.resolve(reg),getRegistration:async()=>reg}},
    document:{getElementById:node,addEventListener:()=>{}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    trackAppEvent:()=>{},urlBase64ToUint8Array:()=>[],VAPID_PUBLIC_KEY:'test',toast:()=>{},alert:()=>{},console,
  };
  context.window.VizinhoCertoInstall={getNotificationPresentation:()=>({status:notification.permission==='granted'?'enabled':'available'})};
  vm.createContext(context);vm.runInContext(code,context);
  context.pushApi=async(action,subscription,extra={})=>{
    calls.push(action);
    if(action==='push-status'){
      if(controls.failStatus)throw new Error('network');
      return {enabled:server.enabled,registered:server.registered&&Boolean(sub),automaticas:server.automaticas,renew_subscription:server.renew_subscription===true&&!server.registered};
    }
    if(action==='push-register'){
      if(controls.failRegister)throw new Error('network');
      server.registered=true;server.enabled=true;return {...server};
    }
    if(action==='push-recover'){
      controls.recoveredEndpoint=subscription?.toJSON().endpoint;
      if(controls.failRecover)throw new Error('network');
      if(server.enabled)server.registered=true;
      return {...server};
    }
    if(action==='push-preferences'){server.automaticas=extra.enabled;return {...server};}
    if(action==='push-unregister'){server.registered=false;server.enabled=false;server.automaticas=false;return {...server};}
    throw new Error('Unexpected action');
  };
  return {context,node,calls,history,counts,storage,controls,notification,server};
}

test('ativar e abrir o perfil repetidas vezes mantém estado e só consulta o cadastro',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();f.history.length=0;
  for(let i=0;i<4;i++) await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
  assert.equal(f.calls.filter(x=>x==='push-register').length,1);
  assert.equal(f.calls.filter(x=>x==='push-status').length,4);
  assert.equal(f.counts.subscribes,1);assert.equal(f.counts.unsubscribes,0);
  assert.ok(!f.history.some(x=>x.id==='push-state-label'&&x.value.includes('desativadas')));
});

test('falha de consulta preserva ativação anterior e não grava desativação',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();f.controls.failStatus=true;
  await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
  assert.equal(f.storage.get('vc_push_registered_reader'),'1');
  assert.equal(f.storage.get('vc_push_disabled_reader'),undefined);
  assert.match(f.node('push-status').textContent,/não foi alterada/);
});

test('desativar só remove do servidor e mantém permissão e inscrição do navegador',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();await f.context.acaoNotificacaoPerfil();
  assert.ok(f.calls.includes('push-unregister'));assert.equal(f.counts.unsubscribes,0);
  assert.equal(f.notification.permission,'granted');
  assert.equal(f.node('push-toggle').textContent,'Ativar notificações');
  const reopened=setup({storage:f.storage,subscribed:true,permission:'granted'});
  await reopened.context.sincronizarNotificacoesConcedidas();
  assert.equal(reopened.calls.length,0);assert.equal(reopened.node('push-toggle').textContent,'Ativar notificações');
});

test('abrir perfil não cria inscrição nem ativa notificações ausentes',async()=>{
  const f=setup({permission:'granted'});await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.counts.subscribes,0);assert.deepEqual(f.calls,['push-status']);
  assert.equal(f.node('push-toggle').textContent,'Ativar notificações');
});

test('parâmetro antigo de permissão não substitui estado atual do navegador e servidor',async()=>{
  const f=setup({subscribed:true,registered:true,permission:'granted'});
  await f.context.sincronizarNotificacoesConcedidas();
  assert.match(f.node('push-state-label').textContent,/ativadas/);
  assert.doesNotMatch(f.node('push-state-label').textContent,/bloqueadas/);
});

test('cadastro ausente no servidor é mostrado sem recadastrar durante consulta',async()=>{
  const f=setup({subscribed:true,registered:false,permission:'granted'});
  await f.context.sincronizarNotificacoesConcedidas();
  assert.deepEqual(f.calls,['push-status']);assert.equal(f.node('push-toggle').textContent,'Ativar notificações');
});

test('consultas concorrentes do perfil são agrupadas sem mudar preferências',async()=>{
  const f=setup({subscribed:true,registered:true,permission:'granted'});
  await Promise.all([f.context.sincronizarNotificacoesConcedidas(),f.context.sincronizarNotificacoesConcedidas()]);
  assert.deepEqual(f.calls,['push-status']);assert.equal(f.counts.unsubscribes,0);
});

test('falha de cadastro não mostra sucesso e permite nova tentativa',async()=>{
  const f=setup();f.controls.failRegister=true;await f.context.acaoNotificacaoPerfil();
  assert.notEqual(f.storage.get('vc_push_registered_reader'),'1');
  assert.equal(f.node('push-toggle').disabled,false);
  f.controls.failRegister=false;await f.context.acaoNotificacaoPerfil();
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
});

test('convite aparece após login sem solicitar permissão automaticamente',()=>{
  const f=setup();f.context.oferecerNotificacoesPosLogin();
  assert.equal(f.node('notification-welcome').hidden,false);
  assert.equal(f.counts.permissionRequests,0);assert.equal(f.calls.length,0);
  f.context.E.userId=null;f.context.oferecerNotificacoesPosLogin();
  assert.equal(f.node('notification-welcome').hidden,true);
});

test('Agora não mantém acesso e não insiste ao entrar novamente',()=>{
  const f=setup();f.context.adiarNotificacoesEntrada();
  const next=setup({storage:f.storage});next.context.oferecerNotificacoesPosLogin();
  assert.equal(next.node('notification-welcome').hidden,true);
  assert.equal(next.context.E.userId,'reader');assert.equal(next.calls.length,0);
});

test('clique após login pede permissão no gesto e só conclui após cadastro aceito',async()=>{
  const f=setup();const pending=f.context.ativarNotificacoesEntrada(f.node('notification-welcome-enable'));
  assert.equal(f.counts.permissionRequests,1);
  assert.notEqual(f.storage.get('vc_push_offer_seen_reader'),'1');
  await pending;
  assert.equal(f.storage.get('vc_push_registered_reader'),'1');
  assert.equal(f.storage.get('vc_push_offer_seen_reader'),'1');
  assert.equal(f.node('notification-welcome').hidden,true);
});

test('convite respeita permissão recusada, desativação explícita e falha de cadastro',async()=>{
  const denied=setup({permission:'denied'});denied.context.oferecerNotificacoesPosLogin();
  assert.equal(denied.node('notification-welcome').hidden,true);
  const off=setup({storage:new Map([['vc_push_disabled_reader','1']])});off.context.oferecerNotificacoesPosLogin();
  assert.equal(off.node('notification-welcome').hidden,true);
  const failed=setup();failed.controls.failRegister=true;
  await failed.context.ativarNotificacoesEntrada(failed.node('notification-welcome-enable'));
  assert.notEqual(failed.storage.get('vc_push_offer_seen_reader'),'1');
  assert.match(failed.node('notification-welcome-status').textContent,/Não foi possível/);
  assert.equal(failed.node('notification-welcome-enable').disabled,false);
});

test('fechar e reabrir com inscrição ausente recupera envio e mantém resumo salvo',async()=>{
  const first=setup();await first.context.acaoNotificacaoPerfil();
  const checkbox=first.node('push-daily-enabled');checkbox.checked=true;
  await first.context.alterarResumoAutomatico(checkbox);
  const reopened=setup({storage:first.storage,server:first.server,permission:'granted',subscribed:false});
  await reopened.context.sincronizarNotificacoesConcedidas();
  assert.deepEqual(reopened.calls,['push-status','push-recover']);
  assert.equal(reopened.node('push-toggle').textContent,'Desativar notificações');
  assert.equal(reopened.node('push-daily-enabled').checked,true);
  assert.equal(reopened.counts.subscribes,1);assert.equal(reopened.counts.permissionRequests,0);
  assert.ok(!reopened.history.some(x=>x.id==='push-state-label'&&x.value.includes('desativadas')));
});

test('token rotacionado mantém preferência e reconecta sem outro pedido de permissão',async()=>{
  const f=setup({subscribed:true,registered:false,enabled:true,automaticas:true,permission:'granted'});
  await f.context.sincronizarNotificacoesConcedidas();
  assert.deepEqual(f.calls,['push-status','push-recover']);assert.equal(f.counts.subscribes,0);
  assert.equal(f.node('push-daily-enabled').checked,true);
});

test('falha ao reconectar não apaga ativação ou resumo',async()=>{
  const f=setup({enabled:true,automaticas:true,permission:'granted'});f.controls.failRecover=true;
  await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.storage.get('vc_push_registered_reader'),'1');
  assert.equal(f.node('push-daily-enabled').checked,true);
  assert.match(f.node('push-status').textContent,/Sua escolha está salva/);
  f.controls.failRecover=false;await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.counts.subscribes,1);assert.equal(f.counts.permissionRequests,0);
});

test('recuperação usa permissão push existente sem abrir nova solicitação',async()=>{
  const f=setup({enabled:true,permission:'default'});f.controls.pushPermission='granted';
  await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.counts.subscribes,1);assert.equal(f.counts.permissionRequests,0);
});

test('identificação da instalação é estável entre sessões e independente do token',()=>{
  const first=setup();const id=first.context.idInstalacaoNotificacoes();
  const next=setup({storage:first.storage});assert.equal(next.context.idInstalacaoNotificacoes(),id);
});

test('endereço rejeitado pelo provedor é substituído, sem repetir pedido de permissão ou apagar resumo',async()=>{
  const f=setup({subscribed:true,permission:'granted',server:{enabled:true,registered:false,automaticas:true,renew_subscription:true}});
  await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.counts.unsubscribes,1);assert.equal(f.counts.subscribes,1);
  assert.equal(f.controls.recoveredEndpoint,'test-2');assert.equal(f.counts.permissionRequests,0);
  assert.equal(f.node('push-daily-enabled').checked,true);
  await f.context.sincronizarNotificacoesConcedidas();
  assert.equal(f.counts.unsubscribes,1);assert.equal(f.counts.subscribes,1);
});

test('renovação não remove endereço quando permissão está bloqueada ou pendente',async()=>{
  for(const permission of ['denied','default']){
    const f=setup({subscribed:true,permission,server:{enabled:true,registered:false,automaticas:true,renew_subscription:true}});
    await f.context.sincronizarNotificacoesConcedidas();
    assert.equal(f.counts.unsubscribes,0);assert.equal(f.counts.subscribes,0);assert.equal(f.counts.permissionRequests,0);
    assert.equal(f.node('push-daily-enabled').checked,true);
  }
});

test('falha automática oferece reconexão pelo clique, com permissão e resumo preservados',async()=>{
  const f=setup({subscribed:true,permission:'default',server:{enabled:true,registered:false,automaticas:true,renew_subscription:true}});
  await f.context.sincronizarNotificacoesConcedidas();
  assert.match(f.node('push-state-label').textContent,/recebimento pendente/);
  assert.equal(f.node('push-reconnect').hidden,false);assert.equal(f.counts.permissionRequests,0);
  const retry=f.context.reconectarAvisosPerfil();
  assert.equal(f.counts.permissionRequests,1);
  await retry;
  assert.equal(f.counts.unsubscribes,1);assert.equal(f.counts.subscribes,1);
  assert.equal(f.server.automaticas,true);assert.equal(f.node('push-daily-enabled').checked,true);
  assert.equal(f.node('push-reconnect').hidden,true);
  assert.match(f.node('push-state-label').textContent,/ativadas/);
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
});
