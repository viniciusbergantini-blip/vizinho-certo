const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { eligiblePosts, runDigest, handleDigest } = require('../lib/notification-digest');
const { normalizeSubscription } = require('../lib/notification-handler');
const root = path.join(__dirname, '..');
const now = new Date('2026-11-10T22:00:00Z');
const user = { id:'reader', cidade:'Test', lat:1, lon:1, raio:150 };
const post = {id:'p',usuario_id:'author',cidade:'Test',lat:1,lon:1,texto:'Oi',criado_em:'2026-11-10T20:00:00Z'};

test('resumo usa apenas novidades próximas, recentes, sem SOS e sem bloqueados', () => {
  const posts = [post, {...post,usuario_id:'reader'}, {...post,lat:null}, {...post,lat:2},
    {...post,texto:'🆘 ALERTA DE EMERGÊNCIA'}, {...post,criado_em:'2026-11-08T00:00:00Z'},
    {...post,criado_em:'2026-11-11T00:00:00Z'}, {...post,cidade:'Outra'}, {...post,usuario_id:'blocked'}];
  assert.deepEqual(eligiblePosts(user, posts, [{bloqueador_id:'blocked',bloqueado_id:'reader'}], now), [post]);
});

function digestDb() {
  const deliveries = new Set(), updates = [], filters = [];
  const db = {from(table) {
    if(table === 'push_digest_deliveries') return {
      insert: async row => {const k=row.usuario_id+row.dia;if(deliveries.has(k))return {error:{code:'23505'}};deliveries.add(k);return {};},
      update: row => {updates.push(row); return {eq:()=>({eq:async()=>({})})};},
    };
    const values = table==='push_tokens'?[{usuario_id:'reader',token:'token'}]:table==='usuarios'?[user]:table==='posts'?[post]:[];
    const query = {then: resolve=>resolve({data:values}),select:()=>query,eq:(...args)=>{filters.push(args);return query;},
      in:()=>query,gte:()=>query,order:()=>query,limit:()=>query,or:()=>query};
    return query;
  }};
  return {db,deliveries,updates,filters};
}

test('resumo exige opt-in Android e não repete após execuções concorrentes', async () => {
  const {db,deliveries,filters} = digestDb(); let sends=0;
  const deliver = async()=>{sends++;return {sent:1};};
  await Promise.all([runDigest(db,{now,deliver}),runDigest(db,{now,deliver})]);
  assert.equal(sends,1); assert.equal(deliveries.size,1);
  assert.ok(filters.some(([k,v])=>k==='plataforma'&&v==='android'));
  assert.ok(filters.some(([k,v])=>k==='automaticas'&&v===true));
});

test('simulação não envia nem consome cota e horário noturno não consulta dados', async () => {
  const {db,deliveries} = digestDb();
  const result = await runDigest(db,{now,dryRun:true,deliver:()=>assert.fail('sent')});
  assert.equal(result.eligible,1); assert.equal(deliveries.size,0);
  assert.equal((await runDigest({from:()=>assert.fail('queried')},{now:new Date('2026-11-11T03:00:00Z')})).skipped,'outside_window');
});

test('agendamento rejeita chamada sem identidade válida', async () => {
  let code,body; const res={status:c=>{code=c;return res;},json:b=>{body=b;}};
  await handleDigest({method:'POST',headers:{}},res);
  assert.equal(code,401);assert.ok(body.error);
});

test('inscrição valida serviço push e normaliza serialização sem permitir endereço arbitrário', () => {
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  assert.equal(normalizeSubscription(sub),normalizeSubscription({...sub,expirationTime:null}));
  assert.throws(()=>normalizeSubscription({...sub,endpoint:'https://127.0.0.1/test'}));
  assert.throws(()=>normalizeSubscription({...sub,endpoint:'https://fcm.googleapis.com.evil.test/test'}));
});

test('estado do cadastro consulta somente a inscrição do usuário sem alterar tokens',async()=>{
  const handler=require('../lib/notification-handler');
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  const filters=[];
  const query={select:()=>query,eq:(k,v)=>{filters.push([k,v]);return query;},maybeSingle:async()=>({data:{id:'own',automaticas:true}})};
  let body;const res={json:x=>{body=x;},status:()=>res};
  await handler({body:{action:'push-status',subscription:sub}},res,{from:()=>query},'reader');
  assert.deepEqual(body,{registered:true,automaticas:true});
  assert.ok(filters.some(([k,v])=>k==='usuario_id'&&v==='reader'));
  assert.ok(filters.some(([k,v])=>k==='token'&&v===normalizeSubscription(sub)));
});

test('antigos testes de notificação não enviam nada',async()=>{
  const handler=require('../lib/notification-handler');
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  for(const action of ['push-test','push-test-sos']){
    let status;const res={status:x=>{status=x;return res;},json:()=>{}};
    await handler({body:{action,subscription:sub}},res,{from:()=>assert.fail('must not query or send')},'reader');
    assert.equal(status,410);
  }
});


for (const scenario of ['create','comment']) test(`${scenario} aguarda envio antes da resposta, sem depender de SOS`, async () => {
  let finish, sentResponse=false, sending=false;
  const notify=()=>{sending=true;return new Promise(r=>{finish=r;});};
  const query={select:()=>query,eq:()=>query,gte:()=>query,insert:()=>query,or:()=>query,
    maybeSingle:async()=>({data:{...user,nome:'Reader',usuario_id:'author'}}),
    single:async()=>({data:{...post,apelido_autor:'Reader'}}),
    then:resolve=>resolve({data:[],count:0})};
  const module={exports:{}};
  const security={authenticate:async()=>({user:{id:'reader'}}),noStore:()=>{},serviceClient:()=>({from:()=>query}),
    cleanText:(v)=>String(v||''),safeRecordId:v=>v,enforceRateLimit:()=>true,enforceBodyLimit:()=>true,enforceTrustedOrigin:()=>true,
    serverError:()=>assert.fail('API error')};
  vm.runInNewContext(fs.readFileSync(path.join(root,'api/posts.js'),'utf8'),{module,URL,Date,console,process:{env:{}},require:n=>
    n.endsWith('api-security')?security:n.endsWith('push-notifications')?{notifyNearby:notify,notifyUsers:notify}:require(path.resolve(root,'api',n))});
  const res={status:()=>res,json:()=>{sentResponse=true;}};
  const running=module.exports({method:'POST',query:{},headers:{},body:{action:scenario,texto:'Oi',tipo:'info',post_id:'post'}},res);
  for(let i=0;i<30&&!sending;i++) await new Promise(r=>setImmediate(r));
  assert.equal(sending,true);assert.equal(sentResponse,false);
  finish({sent:1});await running;assert.equal(sentResponse,true);
});

test('push define urgência e expiração curta para SOS e remove inscrição expirada', async () => {
  const options=[],removed=[];const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/push-notifications.js'),'utf8'),{module,Date,Set,JSON,Promise,console,
    process:{env:{VAPID_SUBJECT:'test',VAPID_PUBLIC_KEY:'p',VAPID_PRIVATE_KEY:'s'}},require:n=>n==='web-push'?{
      setVapidDetails:()=>{},sendNotification:async(sub,payload,opts)=>{options.push(opts);if(sub.endpoint==='expired')throw {statusCode:410};}
    }:require('../lib/localizacao')});
  const token=endpoint=>({id:endpoint,usuario_id:'u',token:JSON.stringify({endpoint,keys:{p256dh:'p',auth:'a'}})});
  const db={from:()=>({delete:()=>({in:async(k,t)=>{assert.equal(k,'id');removed.push(...t);return {};}})})};
  const result=await module.exports.sendTokens(db,[token('ok'),token('expired')],{title:'🆘 Test'});
  assert.equal(result.sent,1);assert.equal(removed.length,1);assert.equal(options[0].TTL,600);assert.equal(options[0].urgency,'high');
});
