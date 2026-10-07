"""Validate every new app, generated audio and printable page before publication."""
from pathlib import Path
import os,json,subprocess,concurrent.futures,re
import fitz
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('OUTPUT_ROOT','.')).resolve();S=ROOT/'students';Q=ROOT/'rollout-qa';Q.mkdir(exist_ok=True)
results=[]
def check(name,value):
 results.append(dict(test=name,passed=bool(value)));(Q/'tests.json').write_text(json.dumps(results,indent=2))
 if not value:raise AssertionError(name)
 print('PASS',name,flush=True)
apps=[p for p in S.iterdir() if (p/'data.json').exists()];check('15 new apps',len(apps)==15)
check('No excluded or existing student app written',not any((S/s).exists() for s in ['antonia','charline','jack','jaida','kitty','samantha','loriana','sokvan','chasity','aisha']))
check('No raw fonts or private source documents',not list(S.rglob('*.ttf')) and not list(S.rglob('Student_Profile*')))
for p in apps:
 d=json.loads((p/'data.json').read_text());m=json.loads((p/'audio-manifest.json').read_text());check(p.name+' complete records',all(w['ko'] and w['en'] and w['example'] and w['exampleEn'] for w in d['words']))
 check(p.name+' expected audio',m['complete'] and len(m['generated'])==d['audioExpected'])
 text_map={w['id']+'-'+kind:w[field] for w in d['words'] for kind,field in [('word','ko'),('polite','yo'),('example','example')] if w[field]}
 check(p.name+' exact text and files',all((p/e['url']).is_file() and e['text']==text_map[k] for k,e in m['generated'].items()))
 for filename in ['app.js','scheduler.js','sw.js']:check(p.name+' '+filename+' syntax',subprocess.run(['node','--check',str(p/filename)],capture_output=True).returncode==0)
 for sheet in d['sheets']:
  f=p/sheet['url'];pdf=fitz.open(f);check(p.name+' '+sheet['id']+' one page',len(pdf)==1)
 for f in p.rglob('*.pdf'):
  doc=fitz.open(f)
  for pg in doc:
   text=pg.get_text();check(p.name+'/'+f.name+' glyphs','\ufffd' not in text)
   for block in pg.get_text('dict')['blocks']:
    if block['type']!=0:continue
    for line in block['lines']:
     for span in line['spans']:
      x0,y0,x1,y1=span['bbox']
      if min(x0,y0)<-1 or x1>pg.rect.width+1 or y1>pg.rect.height+1:raise AssertionError('PDF overflow '+str(f)+' '+span['text'])
audio=list((S/'shared/audio').glob('*.mp3'))
def probe(f):
 r=subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','null','-'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);return (f.name,r.stderr.decode()) if r.returncode or r.stderr else None
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:errors=[e for e in pool.map(probe,audio) if e]
check('Every audio file fully decodes',not errors);(Q/'audio.json').write_text(json.dumps(dict(files=len(audio),errors=errors),indent=2))
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,args=['--no-sandbox']);pageErrors=[]
 for a in apps:
  c=browser.new_context(viewport=dict(width=390,height=844),accept_downloads=True);p=c.new_page();p.on('pageerror',lambda e:pageErrors.append(str(e)));url='http://127.0.0.1:8765/students/'+a.name+'/'
  p.goto(url);p.wait_for_selector('[data-action=start]');d=p.evaluate('KATHARINE_DATA');check(a.name+' mobile width',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  daily=p.evaluate('KATHARINE_DEBUG.dailySheet().id');p.reload();check(a.name+' stable daily PDF',p.evaluate('KATHARINE_DEBUG.dailySheet().id')==daily)
  p.locator('[data-action=start]').first.click();p.locator('[data-action=reveal]').click();p.locator('[data-grade="3"]').click();check(a.name+' saved grade',p.evaluate('KATHARINE_DEBUG.getState().history.length')==1)
  st=p.evaluate('KATHARINE_DEBUG.getState()');k=st['history'][0]['id'];check(a.name+' independent directions',st['cards'][k]['r']['total']==1 and st['cards'][k]['p']['total']==0)
  check(a.name+' correct isolated identity',st['student']==d['student'] and st['appId']==d['appId'])
  p.reload();check(a.name+' persistence',p.evaluate('KATHARINE_DEBUG.getState().history.length')==1)
  check(a.name+' reject another student backup',p.evaluate("()=>{let s=KATHARINE_DEBUG.getState();s.student='Other learner';try{KATHARINE_DEBUG.validate(s);return false;}catch(e){return true;}}"))
  p.locator('[data-view=library]').click();p.fill('#search','들어요');check(a.name+' conjugation search',p.locator('.wordrow .ko').first.inner_text()=='듣다')
  p.locator('[data-view=patterns]').click()
  if d['workshops']:
   key=d['workshops'][0]['id'];p.fill('#draft-'+key,'연습이 중요해요.');p.locator('[data-workshop="'+key+'"]').click();p.reload();p.locator('[data-view=patterns]').click();check(a.name+' saved writing draft',p.locator('#draft-'+key).input_value()=='연습이 중요해요.')
  p.locator('[data-view=settings]').click()
  with p.expect_download() as dd:p.locator('[data-action=export]').first.click()
  b=Q/(a.name+'-test-backup.json');dd.value.save_as(str(b));check(a.name+' backup has real grade',len(json.loads(b.read_text())['history'])==1)
  p.goto(url);p.evaluate('navigator.serviceWorker.ready');p.wait_for_timeout(200);c.set_offline(True);p.reload();check(a.name+' offline shell',p.locator('[data-action=start]').count()>0);c.set_offline(False)
  p.goto(url);p.screenshot(path=str(Q/(a.name+'-mobile.png')),full_page=True)
  if a.name in ['elvira','asa','huixin','katharine']:
   p.set_viewport_size(dict(width=1440,height=1050));p.screenshot(path=str(Q/(a.name+'-desktop.png')),full_page=True)
  c.close()
 check('No browser JavaScript errors',not pageErrors);browser.close()
for slug in ['elvira','asa','huixin','katharine']:
 a=S/slug;d=json.loads((a/'data.json').read_text());f=a/d['sheets'][0]['url'];doc=fitz.open(f);doc[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(Q/(slug+'-print.png'))
print('Validated all apps',flush=True)
