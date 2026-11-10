const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');
const code=html.slice(html.indexOf('let registroPushEmAndamento='),html.indexOf('function atualizarEstadoRede()'));

function setup({storage=new Map(),subscribed=false,registered=false,permission='default'}={}){
  const nodes=new Map(),calls=[],history=[],controls={failStatus:false,failRegister:false};
  const counts={subscribes:0,unsubscribes:0};
  const node=id=>{if(!nodes.has(id)){
    let value='';const el={disabled:false,checked:false};
    Object.defineProperty(el,'textContent',{get:()=>value,set:v=>{value=v;history.push({id,value:v});}});nodes.set(id,el);
  }return nodes.get(id);};
  const makeSub=()=>({toJSON:()=>({endpoint:'test'}),unsubscribe:async()=>{counts.unsubscribes++;sub=null;return true;}});
  let sub=subscribed?makeSub():null;
  const reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>{counts.subscribes++;return sub=makeSub();}}};
  const notification={permission,requestPermission:async()=>notification.permission='granted'};
  const context={E:{userId:'reader'},VC_PLAY_STORE_MODE:true,Notification:notification,
    window:{Notification:notification,PushManager:function(){},location:{search:'?vc_android_notifications=0'}},
    navigator:{userAgent:'Android',serviceWorker:{register:async()=>reg,ready:Promise.resolve(reg),getRegistration:async()=>reg}},
    document:{getElementById:node,addEventListener:()=>{}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    trackAppEvent:()=>{},urlBase64ToUint8Array:()=>[],VAPID_PUBLIC_KEY:'test',toast:()=>{},alert:()=>{},console,
  };
  context.window.VizinhoCertoInstall={getNotificationPresentation:()=>({status:notification.permission==='granted'?'enabled':'available'})};
  vm.createContext(context);vm.runInContext(code,context);
  context.pushApi=async(action)=>{
    calls.push(action);
    if(action==='push-status'){
      if(controls.failStatus)throw new Error('network');
      return {registered,automaticas:false};
    }
    if(action==='push-register'){
      if(controls.failRegister)throw new Error('network');
      registered=true;return {registered:true,automaticas:false};
    }
    if(action==='push-unregister'){registered=false;return {registered:false};}
    throw new Error('Unexpected action');
  };
  return {context,node,calls,history,counts,storage,controls,notification};
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
  assert.equal(f.counts.subscribes,0);assert.equal(f.calls.length,0);
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
