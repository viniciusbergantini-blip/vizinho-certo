const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');
const code = html.slice(html.indexOf('let registroPushEmAndamento='),html.indexOf('function atualizarEstadoRede()'));

function setup({permission='default',storage=new Map(),failure=false,nativePermission=null}={}) {
  const nodes=new Map(),calls=[],counts={subscribes:0,unsubscribes:0};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,checked:false});return nodes.get(id);};
  let sub=null;
  const makeSub=()=>({toJSON:()=>({endpoint:'test'}),unsubscribe:async()=>{counts.unsubscribes++;sub=null;return true;}});
  const reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>{counts.subscribes++;return sub=makeSub();}}};
  const notification={permission,requestPermission:async()=>notification.permission='granted'};
  const context={E:{userId:'reader'},VC_PLAY_STORE_MODE:true,Notification:notification,
    window:{Notification:notification,PushManager:function(){},location:{search:nativePermission===null?'':'?vc_android_notifications='+nativePermission}},
    URLSearchParams,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    navigator:{userAgent:'Android',serviceWorker:{register:async()=>reg,ready:Promise.resolve(reg),getRegistration:async()=>reg}},
    document:{getElementById:node,addEventListener:()=>{}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    trackAppEvent:()=>{},urlBase64ToUint8Array:()=>[],VAPID_PUBLIC_KEY:'test',toast:()=>{},alert:()=>{},console,
  };
  context.window.VizinhoCertoInstall={getNotificationPresentation:()=>({status:notification.permission==='granted'?'enabled':'available'})};
  vm.createContext(context);vm.runInContext(code,context);
  context.pushApi=async(action)=>{calls.push(action);if(failure)throw new Error('Servidor indisponível');return {automaticas:true};};
  return {context,node,calls,counts,storage,notification};
}

test('ativar troca o botão para Desativar apenas após confirmação do servidor',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
  assert.equal(f.node('push-test-normal').disabled,false);assert.equal(f.counts.subscribes,1);
  assert.match(f.node('push-state-label').textContent,/ativadas/);
});

test('desativar remove inscrição e não reativa na sincronização ou ao reabrir o perfil',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();await f.context.acaoNotificacaoPerfil();
  assert.equal(f.counts.unsubscribes,1);assert.ok(f.calls.includes('push-unregister'));
  assert.equal(f.node('push-toggle').textContent,'Ativar notificações');
  assert.equal(f.node('push-daily-enabled').checked,false);assert.equal(f.node('push-test-normal').disabled,true);
  f.context.sincronizarNotificacoesConcedidas();
  const reopen=setup({storage:f.storage,permission:'granted'});
  assert.equal(await reopen.context.registrarNotificacoes(),false);
  assert.equal(reopen.counts.subscribes,0);assert.equal(reopen.calls.length,0);
});

test('escolha explícita permite reativar depois de desativar',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();await f.context.acaoNotificacaoPerfil();
  await f.context.acaoNotificacaoPerfil();
  assert.equal(f.counts.subscribes,2);assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
});

test('falha de cadastro nunca mostra ativado ou libera teste',async()=>{
  const f=setup({failure:true});await f.context.acaoNotificacaoPerfil();
  assert.equal(f.node('push-toggle').textContent,'Ativar notificações');assert.equal(f.node('push-test-normal').disabled,true);
  assert.doesNotMatch(f.node('push-state-label').textContent,/^Notificações ativadas/);
});

test('teste não reativa uma inscrição desativada',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();await f.context.acaoNotificacaoPerfil();
  const before=f.calls.length;await f.context.testarNotificacao(f.node('push-test-normal'));
  assert.equal(f.calls.length,before);assert.equal(f.counts.subscribes,1);
  assert.equal(f.node('push-test-normal').disabled,true);
});

test('permissão nativa bloqueada prevalece sobre cadastro de envio e impede teste',async()=>{
  const f=setup({nativePermission:'0'});await f.context.acaoNotificacaoPerfil();
  assert.match(f.node('push-state-label').textContent,/bloqueadas no Android/);
  assert.equal(f.node('push-test-normal').disabled,true);
  const before=f.calls.length;await f.context.testarNotificacao(f.node('push-test-sos'),{sos:true});
  assert.equal(f.calls.length,before);
  f.context.window.location.search='?vc_android_notifications=1';
  await f.context.registrarNotificacoes();
  assert.match(f.node('push-state-label').textContent,/ativadas/);
  assert.equal(f.node('push-test-normal').disabled,false);
});

test('falha ao desativar mantém estado ativo até a remoção ser confirmada',async()=>{
  const f=setup();await f.context.acaoNotificacaoPerfil();
  f.context.pushApi=async()=>{throw new Error('Não foi possível desativar');};
  await f.context.acaoNotificacaoPerfil();
  assert.equal(f.node('push-toggle').textContent,'Desativar notificações');
  assert.equal(f.storage.get('vc_push_disabled_reader'),undefined);
  assert.equal(f.counts.unsubscribes,0);
});
