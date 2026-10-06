const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.textContent='';this.hidden=false;this.disabled=false;this.attributes={};this.nodes={}}
 set innerHTML(value){this.html=value;for(const match of value.matchAll(/id="([^"]+)"/g))this.nodes['#'+match[1]]=new Element();this.nodes['#teacher-submission-records'].nodes.ul=new Element('ul')}
 setAttribute(key,value){this.attributes[key]=value}
 querySelector(sel){return this.nodes[sel]||null}
 appendChild(e){this.children.push(e)}
 replaceChildren(){this.children=[]}
 addEventListener(type,fn){this.events[type]=fn}
 insertAdjacentElement(_,e){this.inserted=e}
 click(){this.events.click?.()}
 remove(){}
}
(async()=>{
 const header=new Element(),body=new Element(),ls=new Map(),blobs=[];
 const ctx={console,Date,Map,Set,JSON,Math,Object,Promise,encodeURIComponent,setTimeout,clearTimeout,AbortController,Blob,
  localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v)},indexedDB:{open(){throw Error('synthetic test: disabled')}},navigator:{locks:{request:async(_,f)=>f()}},
  URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:synthetic'},revokeObjectURL(){}},
  document:{readyState:'complete',body,querySelector:()=>header,getElementById:()=>null,createElement:tag=>new Element(tag)},
  App:{buildCardPool:async()=>({allCards:[{id:'ko:test',kr:'테스트',en:'test'}]})},JACK_SUBMISSION_CONFIG:{enabled:false},addEventListener(){},
  fetch(){throw Error('Unexpected network request')}
 };ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/js/storage.js','utf8'),ctx);vm.runInContext(fs.readFileSync(root+'/js/submissions.js','utf8'),ctx);
 const settle=()=>new Promise(r=>setTimeout(r,20));await settle();const panel=header.inserted;
 assert.ok(panel);const status=panel.querySelector('#teacher-submit-status'),submit=panel.querySelector('#teacher-submit');
 assert.match(status.textContent,/connection is unavailable/);submit.click();await settle();assert.match(status.textContent,/No reviewed answers/);
 await vm.runInContext("Storage.rateWord({id:'ko:test',kr:'테스트',en:'test'},'know','words')",ctx);submit.click();submit.click();await settle();
 assert.match(status.textContent,/1 results saved on this device. Not sent/);assert.equal((await vm.runInContext('Storage.snapshot()',ctx)).submissions.items.length,1);
 panel.querySelector('#teacher-download').click();await settle();assert.match(status.textContent,/does not submit/);assert.equal(blobs.length,1);assert.match(await blobs[0].text(),/테스트/);
 assert.equal(panel.querySelector('#teacher-retry').hidden,true);assert.equal(submit.disabled,false);assert.equal(panel.querySelector('#teacher-submission-records').children.length,0);
 for(const file of ['index.html','vocabulary.html','flashcards.html','learn.html','quiz.html']){const s=fs.readFileSync(root+'/'+file,'utf8');assert.ok(s.indexOf('js/storage.js')<s.indexOf('js/submissions.js'));assert.ok(s.includes('js/submission-config.js?v=20261007.submit1'));assert.ok(s.includes('css/submissions.css?v=20261007.submit1'));}
 console.log('PASS DOM smoke: visible disabled-receiver disclosure, empty and double Submit, real Storage persistence, CSV download, retry hidden, all five page script ordering');
})().catch(e=>{console.error(e);process.exit(1)});
