const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../lib/notification-handler');
const installation='960dc276-5b8e-4259-a706-d6b1522950ae';
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/current',expirationTime:null,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
const token=handler.normalizeSubscription(sub);
function response(){return {code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}

test('status sem assinatura conserva preferência de instalação e indica reconexão',async()=>{
  const filters=[];
  const sb={from:table=>{
    const q={select:()=>q,eq:(k,v)=>{filters.push([table,k,v]);return q;},maybeSingle:async()=>({data:table==='push_installation_settings'?{enabled:true,automaticas:true}:null})};return q;
  }};
  const res=response();await handler({body:{action:'push-status',installation_id:installation,subscription:null}},res,sb,'owner');
  assert.deepEqual(res.body,{enabled:true,registered:false,automaticas:true,needs_reconnect:true});
  for(const table of ['push_installation_settings','push_tokens']){
    assert.ok(filters.some(([t,k,v])=>t===table&&k==='usuario_id'&&v==='owner'));
    assert.ok(filters.some(([t,k,v])=>t===table&&k==='installation_id'&&v===installation));
  }
});

test('rotação de token não apaga a preferência e não é mostrada como desativação',async()=>{
  const sb={from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='push_installation_settings'?{enabled:true,automaticas:true}:{token:token.replace('current','old')}})};return q;}};
  const res=response();await handler({body:{action:'push-status',installation_id:installation,subscription:sub}},res,sb,'owner');
  assert.equal(res.body.enabled,true);assert.equal(res.body.automaticas,true);assert.equal(res.body.needs_reconnect,true);
});

test('recuperação usa transação com usuário autenticado, nunca o id fornecido no corpo',async()=>{
  let args;
  const sb={rpc:async(name,input)=>{assert.equal(name,'configure_push_installation');args=input;return {data:{enabled:true,registered:true,automaticas:true}};}};
  const res=response();await handler({body:{action:'push-recover',installation_id:installation,subscription:sub,platform:'android',usuario_id:'intruder'}},res,sb,'owner');
  assert.equal(args.p_usuario_id,'owner');assert.equal(args.p_installation_id,installation);
  assert.equal(args.p_action,'recover');assert.equal(args.p_token,token);assert.equal(res.body.automaticas,true);
});

test('desativação e resumo independem de ter um endpoint atual no navegador',async()=>{
  for(const [action,command] of [['push-unregister','disable'],['push-preferences','preferences']]){
    const sb={rpc:async(name,args)=>{assert.equal(args.p_action,command);assert.equal(args.p_token,null);return {data:{enabled:false}};}};
    const res=response();await handler({body:{action,installation_id:installation,subscription:null,enabled:false,platform:'android'}},res,sb,'owner');
    assert.equal(res.code,200);
  }
});

test('recuperação sem consentimento permanece desativada e ids inválidos são rejeitados',async()=>{
  const sb={rpc:async()=>({data:{enabled:false,registered:false,automaticas:false}})};
  const res=response();await handler({body:{action:'push-recover',installation_id:installation,subscription:sub}},res,sb,'owner');
  assert.equal(res.body.enabled,false);
  const invalid=response();await handler({body:{action:'push-status',installation_id:'other-device'}},invalid,{from:()=>assert.fail('invalid id')},'owner');
  assert.equal(invalid.code,400);
});
