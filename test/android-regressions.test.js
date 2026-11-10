const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

test('vários toques durante upload resultam em uma única publicação', async () => {
  let finishUpload, uploads = 0, requests = 0;
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { value: 'Minha foto', style: {}, textContent: '', disabled: false }); return nodes.get(id); };
  const context = {
    document: { getElementById: node }, E: {userId:'u', apelido:'Teste', posts:[]}, fotoFile: {}, fotoUrl: null, tipoAt:'info',
    temPalavrão:()=>false, temAnuncio:()=>false, toast:()=>{},
    uploadFoto:()=>{uploads++;return new Promise(resolve=>{finishUpload=resolve;});},
    sb:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},
    apiUrl:x=>x, fetch:async()=>{requests++;return {ok:true,json:async()=>({post:{id:'p'}})};},
    COR:['green'], hashStr:()=>0, fecharM:()=>{}, render:()=>{},
    localStorage:{getItem:()=>true}, Date, JSON,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('let publicandoPost=false;'), html.indexOf('async function apoiar(')), context);
  const first = context.postar();
  await Promise.all([context.postar(), context.postar(), context.postar()]);
  assert.equal(uploads, 1); assert.equal(requests, 0); assert.equal(node('post-submit').disabled, true);
  finishUpload('https://example.com/photo.jpg'); await first;
  assert.equal(requests, 1); assert.equal(context.E.posts.length, 1); assert.equal(node('post-submit').disabled, false);
});

test('notificações excluem coordenadas ausentes e contam pessoas, não aparelhos', async () => {
  const deliveries=[];
  const tokens=[{usuario_id:'near',token:JSON.stringify({endpoint:'a',keys:{p256dh:'p',auth:'a'}})}, {usuario_id:'near',token:JSON.stringify({endpoint:'b',keys:{p256dh:'p',auth:'a'}})}, {usuario_id:'missing',token:JSON.stringify({endpoint:'c',keys:{p256dh:'p',auth:'a'}})}];
  const sb={from:table=>table==='push_tokens'?{select:async()=>({data:tokens})}:{select:()=>({in:async()=>({data:[{id:'near',lat:1,lon:1},{id:'missing',lat:null,lon:null}]})})}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/push-notifications.js'),'utf8'),{module,process:{env:{VAPID_SUBJECT:'test',VAPID_PUBLIC_KEY:'p',VAPID_PRIVATE_KEY:'s'}},require:name=>name==='web-push'?{setVapidDetails:()=>{},sendNotification:async s=>{deliveries.push(s.endpoint);}}:name==='./push-receipt'?require('../lib/push-receipt'):require('../lib/localizacao')});
  const result=await module.exports.notifyNearby(sb,{lat:1,lon:1,raio:500},{title:'Test'});
  assert.deepEqual(deliveries.sort(), ['a','b']); assert.equal(result.sent,2); assert.equal(result.notified_users,1);
});

test('diagnóstico distingue aceite do provedor de falha sem expor inscrição ou conteúdo', async () => {
  const logs=[], removed=[];
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/push-notifications.js'),'utf8'),{
    module,process:{env:{VAPID_SUBJECT:'test',VAPID_PUBLIC_KEY:'p',VAPID_PRIVATE_KEY:'s'}},
    console:{info:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},
    require:name=>name==='web-push'?{setVapidDetails:()=>{},sendNotification:async sub=>{
      if(sub.endpoint.includes('expired'))throw {statusCode:410};
      return {statusCode:201};
    }}:name==='./push-receipt'?require('../lib/push-receipt'):require('../lib/localizacao'),
  });
  const tokens=['accepted','expired'].map((suffix,i)=>({id:suffix,usuario_id:'reader',installation_id:'device-'+i,
    token:JSON.stringify({endpoint:'https://fcm.googleapis.com/private-'+suffix,keys:{p256dh:'SECRET',auth:'SECRET'}})}));
  const result=await module.exports.sendTokens({from:()=>({delete:()=>({in:async(field,values)=>{assert.equal(field,'id');removed.push(...values);return {};}})})},tokens,
    {title:'Private title',body:'Private body',tag:'post-example'});
  assert.equal(result.sent,1);assert.equal(result.failed,1);assert.equal(removed.length,1);
  const records=logs.map(entry=>JSON.parse(entry[1]));
  assert.ok(records.some(row=>row.installation_id==='device-0'&&row.result==='accepted'&&row.status===201));
  assert.ok(records.some(row=>row.installation_id==='device-1'&&row.result==='failed'&&row.status===410));
  assert.doesNotMatch(JSON.stringify(logs),/SECRET|fcm\.googleapis|Private title|Private body/);
});
