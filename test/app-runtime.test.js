const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntime } = require('../app-runtime');

test('mantem chamadas relativas no webapp atual', () => {
  const runtime = createRuntime({ location: { protocol: 'https:' } });

  assert.equal(runtime.platform, 'web');
  assert.equal(runtime.native, false);
  assert.equal(runtime.apiOrigin, '');
  assert.equal(runtime.apiUrl('/api/eventos?periodo=semana'), '/api/eventos?periodo=semana');
});

test('usa a API de producao quando executado em um container nativo', () => {
  const runtime = createRuntime({
    location: { protocol: 'capacitor:' },
    Capacitor: { isNativePlatform: () => true }
  });

  assert.equal(runtime.platform, 'native');
  assert.equal(runtime.apiUrl('/api/anuncios-visiveis'), 'https://www.vizinhocerto.com.br/api/anuncios-visiveis');
});

test('aceita origem configurada e normaliza barras', () => {
  const runtime = createRuntime({
    location: { protocol: 'https:' },
    __VIZINHO_CERTO_CONFIG__: { apiOrigin: 'https://preview.exemplo.com.br///' }
  });

  assert.equal(runtime.apiOrigin, 'https://preview.exemplo.com.br');
  assert.equal(runtime.apiUrl('api/checkout-status'), 'https://preview.exemplo.com.br/api/checkout-status');
});

function authFixture(responses, refreshError=null) {
  let session={access_token:'old',user:{id:'u'}},refreshes=0,invalid=0;
  const requests=[];
  const client={auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>{
    refreshes++;if(refreshError)return {error:refreshError};
    session={access_token:'new',user:{id:'u'}};return {data:{session}};
  }}};
  const runtime=createRuntime({location:{protocol:'https:'},fetch:async(url,options)=>{
    requests.push({url,...options});const result=responses.shift();if(result instanceof Error)throw result;return result;
  }});
  return {request:runtime.createAuthenticatedFetch(client,{onInvalidSession:async()=>{invalid++;}}),client,requests,
    counts:()=>({refreshes,invalid})};
}

test('SOS renova token rejeitado e repete uma vez somente após 401 anterior à gravação',async()=>{
  const f=authFixture([{status:401},{status:201}]);
  const body=JSON.stringify({action:'panic'});
  assert.equal((await f.request('/api/posts',{method:'POST',body})).status,201);
  assert.equal(f.requests.length,2);assert.equal(f.requests[0].headers.Authorization,'Bearer old');
  assert.equal(f.requests[1].headers.Authorization,'Bearer new');assert.equal(f.requests[1].body,body);
  assert.deepEqual(f.counts(),{refreshes:1,invalid:0});
});

test('sessão sem renovação exige login e não tenta enviar SOS com token recusado',async()=>{
  const f=authFixture([{status:401}],{status:400,name:'AuthApiError'});
  await assert.rejects(f.request('/api/posts',{method:'POST'}),/Entre novamente/);
  assert.equal(f.requests.length,1);assert.deepEqual(f.counts(),{refreshes:1,invalid:1});
});

test('erro de rede incerto e indisponibilidade não repetem SOS',async()=>{
  const network=authFixture([new Error('network')]);
  await assert.rejects(network.request('/api/posts',{method:'POST'}),/network/);
  assert.equal(network.requests.length,1);assert.equal(network.counts().refreshes,0);
  const unavailable=authFixture([{status:503}]);
  assert.equal((await unavailable.request('/api/posts')).status,503);assert.equal(unavailable.counts().refreshes,0);
});

test('segunda rejeição encerra tentativa sem laço de renovação',async()=>{
  const f=authFixture([{status:401},{status:401}]);
  await assert.rejects(f.request('/api/posts'),/Entre novamente/);
  assert.equal(f.requests.length,2);assert.deepEqual(f.counts(),{refreshes:1,invalid:1});
});

test('troca de conta durante envio não repete SOS em nome de outra pessoa',async()=>{
  const f=authFixture([{status:401}]);
  f.client.auth.refreshSession=async()=>({data:{session:{access_token:'other',user:{id:'other'}}}});
  await assert.rejects(f.request('/api/posts'),/conta mudou/);assert.equal(f.requests.length,1);
});
