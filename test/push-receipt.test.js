const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createReceipt,verifyReceipt,handleReceipt}=require('../lib/push-receipt');

test('comprovante vincula aparelho e publicação; alteração, vencimento e ausência de assinatura são recusados',()=>{
  const previous=process.env.VAPID_PRIVATE_KEY;
  process.env.VAPID_PRIVATE_KEY='receipt-test-secret';
  try{
    const now=Date.now(),proof=createReceipt('owner','device','post-test',now);
    assert.equal(verifyReceipt(proof,now).installationId,'device');
    const [body,mac]=proof.split('.');
    const modified=Buffer.from(JSON.stringify({...verifyReceipt(proof,now),userId:'other'})).toString('base64url');
    assert.equal(verifyReceipt(modified+'.'+mac,now),null);
    assert.equal(verifyReceipt(body+'.invalid',now),null);
    assert.equal(verifyReceipt(proof,now+26*60*60_000),null);
    let status=200;const res={status:n=>{status=n;return res;},json:()=>{}};
    handleReceipt({body:{receipt:'invalid',status:'received'}},res);assert.equal(status,403);
    status=200;handleReceipt({body:{receipt:proof,status:'send'}},res);assert.equal(status,403);
  }finally{if(previous===undefined)delete process.env.VAPID_PRIVATE_KEY;else process.env.VAPID_PRIVATE_KEY=previous;}
});

async function receive({fail=false,expired=false,receipt=true}={}){
  const handlers={},reports=[];let displayed=0,pending;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8'),{
    self:{addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async()=>{
      displayed++;if(fail)throw {name:'NotAllowedError'};
    }}},Notification:{permission:fail?'denied':'granted'},
    fetch:async(url,options)=>{assert.equal(url,'/api/posts');reports.push(JSON.parse(options.body));return {};},
  });
  handlers.push({data:{json:()=>({title:'Post',receipt:receipt?'signed-proof':undefined,
    expiresAt:Date.now()+(expired?-60_000:60_000)})},waitUntil:p=>pending=p});
  await pending;return {reports,displayed};
}

test('worker distingue recebimento de solicitação de exibição e não inclui conteúdo nos registros',async()=>{
  const {reports,displayed}=await receive();
  assert.equal(displayed,1);assert.deepEqual(reports.map(r=>r.status),['received','display_requested']);
  assert.doesNotMatch(JSON.stringify(reports),/Post|keys|endpoint/);
});
test('worker registra bloqueio de exibição e relógio que considera aviso vencido',async()=>{
  const failed=await receive({fail:true});
  assert.equal(failed.reports[1].status,'display_failed');assert.equal(failed.reports[1].error_name,'NotAllowedError');
  const expired=await receive({expired:true});
  assert.equal(expired.displayed,0);assert.equal(expired.reports[0].status,'expired');
});
test('push antigo continua exibindo sem enviar comprovante',async()=>{
  const old=await receive({receipt:false});assert.equal(old.displayed,1);assert.equal(old.reports.length,0);
});
