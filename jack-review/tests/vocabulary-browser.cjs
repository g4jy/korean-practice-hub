// Isolated synthetic browser state. No real learner data, imports, or external requests.
// Set PLAYWRIGHT_MODULE to an installed Playwright package; no installation is performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'..');
const output = path.resolve(__dirname,'../../../verification/vocabulary-states');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  const errors=[],checks=[];
  try {
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const context=await browser.newContext();
    const base='http://127.0.0.1:'+server.address().port;
    await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const load=async()=>{await page.goto(base+'/vocabulary.html');await page.waitForFunction(()=>document.querySelectorAll('.word-toggle').length>0);};
    const stats=()=>page.locator('#vocab-stats .stat-pill').allTextContents();
    const snapshot=()=>page.evaluate(()=>Storage.snapshot());
    const fit=async()=>{
      const layout=await page.evaluate(()=>{
        const visible=e=>e.getClientRects().length>0;
        const controls=[...document.querySelectorAll('.vocab-filter button,#quiz-filter button,.stat-pill,.word-toggle')].filter(visible);
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,
          clipped:controls.filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left<0).map(e=>e.textContent)};
      });
      assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));assert.deepEqual(layout.clipped,[]);
    };
    await load();const n=await page.locator('.word-toggle').count();
    assert.ok(n>=135);assert.deepEqual(await stats(),[n+' Unassessed','0 Review','0 Known']);
    assert.equal(await page.locator('.word-toggle.unassessed').count(),n);
    assert.equal(await page.locator('.word-toggle').first().textContent(),'?');
    assert.match(await page.locator('.word-toggle').first().getAttribute('aria-label'),/Unassessed.*Mark as known/);
    assert.match(await page.locator('.word-toggle').first().getAttribute('title'),/Unassessed/);
    const initial=await snapshot();assert.deepEqual(initial.mastery,{});assert.equal(initial.history.length,0);
    checks.push('fresh pool: all Unassessed, zero Review/Known; accessible ? controls');
    fs.mkdirSync(output,{recursive:true});
    for(const width of [320,390,1280]) {
      await page.setViewportSize({width,height:900});await load();await fit();
      await page.screenshot({path:path.join(output,'fresh-'+width+'.png'),fullPage:true});
      await page.locator('[data-tab="quiz"]').click();await fit();
      await page.locator('#quiz-filter [data-f="review"]').click();assert.equal(await page.locator('#go-quiz').isDisabled(),true);
      await page.locator('#quiz-filter [data-f="unassessed"]').click();assert.match(await page.locator('#go-quiz').textContent(),new RegExp('\\('+n+' words\\)'));
      await page.locator('[data-tab="practice"]').click();assert.equal(await page.locator('#go-practice').textContent(),'Study ('+n+')');await fit();
      await page.locator('#go-practice').click();await page.locator('#practice-card').click();await page.locator('#practice-back').click();
      assert.deepEqual(await snapshot(),initial);
    }
    checks.push('320/390/1280 fit; filtering, opening and revealing never write ratings');
    for(const file of ['learn.html','flashcards.html']) {
      await page.goto(base+'/'+file);await page.waitForFunction(()=>typeof Storage!=='undefined'&&typeof App!=='undefined');
      await page.evaluate(()=>Storage.init());
      if(file==='learn.html') {await page.waitForFunction(()=>document.querySelector('#b0').textContent!=='0');assert.equal(await page.locator('#b0').textContent(),String(n));}
      else {await page.waitForFunction(()=>document.querySelector('#review-weak-btn').textContent.includes('(0)'));assert.equal(await page.locator('.card-badge').count(),0);}
      assert.deepEqual(await snapshot(),initial);
    }
    checks.push('Learn New view and Flashcards zero weak/no badge do not create ratings');
    await load();
    await page.evaluate(async()=>{
      const {allCards:c}=await App.buildCardPool();
      await Storage.change(s=>{
        s.mastery[c[0].id]={known:true};s.mastery[c[1].id]={status:'know'};
        s.mastery[c[2].id]={status:'dont_know'};s.mastery[c[3].id]={status:'unsure'};
        s.mastery[c[4].id]={known:false};s.mastery[c[5].id]={status:'unknown',known:false};
        s.mastery[c[6].id]={b:0};
      });
    });
    await load();assert.deepEqual(await stats(),[(n-5)+' Unassessed','3 Review','2 Known']);
    const seeded=await snapshot();
    for(const [state,count] of [['all',n],['unassessed',n-5],['review',3],['known',2]]) {
      await page.locator('.vocab-filter [data-f="'+state+'"]').click();assert.equal(await page.locator('.word-toggle').count(),count);
    }
    await page.locator('[data-tab="quiz"]').click();
    for(const [state,count] of [['all',n],['unassessed',n-5],['review',3],['known',2]]) {
      await page.locator('#quiz-filter [data-f="'+state+'"]').click();assert.equal(await page.locator('#go-quiz').textContent(),'Start Quiz ('+count+' words)');
    }
    await page.locator('[data-tab="practice"]').click();assert.equal(await page.locator('#go-practice').textContent(),'Study ('+(n-2)+')');
    assert.deepEqual(await snapshot(),seeded);
    checks.push('mixed explicit/legacy/unknown records produce matching Words/Quiz/Study subsets without writes');
    // One deliberate answer, even with two rapid clicks, appends exactly one event.
    await page.locator('#go-practice').click();await page.locator('#practice-card').click();
    await page.evaluate(()=>{document.querySelector('#btn-dont').click();document.querySelector('#btn-dont').click();});
    await page.waitForFunction(async()=> (await Storage.snapshot()).history.length===1);
    const after=await snapshot(),event=after.history[0];
    assert.equal(event.status,'dont_know');assert.equal(event.source,'practice');assert.ok(Date.parse(event.timestamp)>0);
    assert.equal(after.mastery[event.wordId].known,false);assert.ok(after.mastery[event.wordId].lastLearningAt>0);
    for(const [id,m] of Object.entries(seeded.mastery).filter(([,m])=>m.known===true||m.status==='know')) assert.deepEqual(after.mastery[id],m);
    checks.push('explicit practice review records timestamp and one event; pre-existing Known retained');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'pass',cards:n,checks,errors,screenshots:output,scope:'isolated synthetic browser, not authenticated delivery'},null,2));
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
