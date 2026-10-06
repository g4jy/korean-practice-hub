'use strict';
const assert = require('assert/strict'), {rowsFrom,csv,createController} = require('../js/submissions.js');
const clone = x => JSON.parse(JSON.stringify(x));
const cards = [{id:'ko:test',kr:'테스트',en:'test'}];
const event = (n=1,status='know') => ({id:'response:'+n,wordId:'ko:test',word_kr:'테스트',word_en:'test',status,source:'flashcard',timestamp:'2026-10-06T10:00:0'+n+'.000Z'});
function fixture(extra={}) {
 let state={history:[event()],mastery:{},lessons:{private:'no'},observations:{private:'no'},...extra};
 const storage={snapshot:async()=>clone(state),change:async fn=>{let copy=clone(state);const result=fn(copy);state=copy;return result}};
 return {storage,state:()=>state,add:e=>state.history.push(e)};
}
const endpoint='https://script.google.com/macros/s/synthetic_test_only/exec';
let n=0; const opts=f=>({storage:f.storage,getCards:async()=>cards,config:{enabled:false},uid:()=>`jack-synthetic-${++n}`});
(async()=>{
 const f=fixture(); let c=createController(opts(f));
 let result=await c.submit(); assert.equal(result.kind,'disconnected');assert.equal(f.state().submissions.items.length,1);
 await c.submit();assert.equal(f.state().submissions.items.length,1);c=createController(opts(f));await c.submit();assert.equal(f.state().submissions.items.length,1);
 f.add(event(2,'dont_know'));await c.submit();assert.equal(f.state().submissions.items.length,2);
 assert.equal(f.state().submissions.items[0].payload.rows[0].status,'known'); assert.equal(f.state().submissions.items[1].payload.rows[0].status,'unknown');
 console.log('PASS durable local queue, reload, repeated click, and newer delta');
 const bad=fixture({history:[event(),{...event(2),id:'lesson:private',source:'quiz'},{...event(3),source:'lesson'},{...event(4),wordId:'other-student-card'}]});
 assert.equal(rowsFrom(bad.state(),cards).length,1);assert.equal(rowsFrom(bad.state(),cards)[0].response_id,'response:1');
 const p=f.state().submissions.items[0].payload;assert.equal(p.studentKey,'jack');assert.ok(!JSON.stringify(p).includes('private'));assert.ok(!('history' in p));assert.ok(!('deviceId' in p));
 assert.equal(rowsFrom(fixture({history:[],mastery:{'ko:test':{known:true}}}).state(),cards).length,0);
 console.log('PASS response-only allowlist, teacher observations and other learners excluded; no inferred mastery');
 const x=fixture({submissions:{version:1,appId:'kitty',learnerId:'kitty',items:[]}}); await assert.rejects(()=>createController(opts(x)).submit(),/another app/);
 console.log('PASS foreign queue rejected');
 for(const scenario of ['opaque','network','wrong-id','wrong-count','http-error','valid']){
  const f=fixture();let calls=[];const c=createController({...opts(f),config:{enabled:true,endpoint},fetch:async(url,request)=>{
   const payload=JSON.parse(request.body);calls.push(payload);
   if(scenario==='network')throw Error('offline');
   return{type:scenario==='opaque'?'opaque':'cors',ok:scenario!=='http-error',json:async()=>({ok:true,submissionId:scenario==='wrong-id'?'wrong':payload.submissionId,rowCount:scenario==='wrong-count'?999:payload.rows.length})};
  }});
  await c.submit();assert.equal(calls.length,1);assert.equal(f.state().submissions.items[0].state,scenario==='valid'?'confirmed':'unconfirmed');
  await c.submit();await c.retry();assert.equal(calls.length,1);
 }
 console.log('PASS opaque/network/error/mismatched receipts never confirmed; no unsafe retry');
 {const f=fixture();let calls=[];const c=createController({...opts(f),config:{enabled:true,endpoint,idempotent:true},fetch:async(_,r)=>{let p=JSON.parse(r.body);calls.push(p);if(calls.length===1)throw Error('uncertain');return{type:'cors',ok:true,json:async()=>({ok:true,submissionId:p.submissionId,rowCount:p.rows.length})};}});await c.submit();await c.retry();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(f.state().submissions.items[0].state,'confirmed');}
 console.log('PASS verified-idempotent retry retains exact submission ID and payload');
 {const f=fixture();let release,calls=0;const config={enabled:true,endpoint};const fetch=()=>{calls++;return new Promise(r=>release=()=>r({type:'opaque'}))};const a=createController({...opts(f),config,fetch}),b=createController({...opts(f),config,fetch});const pending=a.submit();await new Promise(r=>setTimeout(r,10));await b.submit();assert.equal(calls,1);release();await pending;}
 console.log('PASS two-controller request claim prevents duplicate send');
 assert.ok(csv([{korean:'=HYPERLINK("bad")',english:'\t+cmd'}]).includes("'=HYPERLINK"));assert.ok(csv([{korean:'@evil'}]).includes("'@evil"));
 console.log('PASS CSV quoting/formula protection');
 assert.equal((await createController(opts(fixture({history:[]}))).submit()).items.length,0);
 console.log('PASS empty review set creates no submission');
})().catch(e=>{console.error(e);process.exit(1)});
