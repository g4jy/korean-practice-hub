"""Generate immutable, exact-text Korean MP3 assets; never substitute device audio."""
from pathlib import Path
import asyncio,json,hashlib,os,time
import edge_tts
ROOT=Path(os.environ.get('OUTPUT_ROOT','.')).resolve();S=ROOT/'students/shared';A=S/'audio';A.mkdir(exist_ok=True)
queue=json.loads((S/'audio-request.json').read_text());done=json.loads((S/'audio-existing.json').read_text());failures=[];count=0
# Older manifests used source-text hashes. The sha256 field must identify file bytes.
for text,entry in done.items():
 p=A/Path(entry['url']).name
 b=p.read_bytes()
 entry['text_sha256']=hashlib.sha256(text.encode('utf-8')).hexdigest()
 entry['sha256']=hashlib.sha256(b).hexdigest()
 entry['bytes']=len(b)
(S/'audio-existing.json').write_text(json.dumps(done,ensure_ascii=False,indent=2))
async def main():
 sem=asyncio.Semaphore(5)
 async def one(q):
  global count
  p=A/q['file']
  async with sem:
   if not p.exists() or p.stat().st_size<1000:
    for attempt in range(4):
     tmp=p.with_suffix('.part.mp3')
     try:
      await asyncio.wait_for(edge_tts.Communicate(q['text'].replace(' / ','. '),'ko-KR-SunHiNeural',rate='-10%').save(str(tmp)),75)
      if tmp.stat().st_size<1000:raise ValueError('empty or incomplete recording')
      tmp.replace(p);break
     except Exception as e:
      if tmp.exists():tmp.unlink()
      if attempt==3:failures.append(dict(text=q['text'],error=str(e)));return
      await asyncio.sleep(2**attempt+1)
   b=p.read_bytes();done[q['text']]=dict(url='../shared/audio/'+p.name,text=q['text'],text_sha256=hashlib.sha256(q['text'].encode()).hexdigest(),bytes=len(b),sha256=hashlib.sha256(b).hexdigest());count+=1
   if count%40==0:print('Generated or reused',count,'of',len(queue),flush=True)
 await asyncio.gather(*(one(q) for q in queue))
asyncio.run(main())
for app in (ROOT/'students').iterdir():
 if not (app/'data.json').exists():continue
 d=json.loads((app/'data.json').read_text());m=dict(provider='Microsoft Edge online neural TTS',voice='ko-KR-SunHiNeural',rate='-10%',hash_semantics='sha256 is the MP3 file content hash; text_sha256 is the source text hash.',generated={},missing=[])
 for w in d['words']:
  for kind,field in [('word','ko'),('polite','yo'),('example','example')]:
   if not w[field]:continue
   if w[field] in done:m['generated'][w['id']+'-'+kind]=done[w[field]]
   else:m['missing'].append(dict(id=w['id'],kind=kind,text=w[field]))
 m['complete']=not m['missing']
 for entry in m['generated'].values():
  assert hashlib.sha256((app/entry['url']).read_bytes()).hexdigest()==entry['sha256']
 (app/'audio-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));(app/'audio-manifest.js').write_text('window.KATHARINE_AUDIO='+json.dumps(m,ensure_ascii=False)+';')
(S/'audio-generation-report.json').write_text(json.dumps(dict(requested=len(queue),completed=count,failures=failures,totalUniqueTexts=len(done),all_content_hashes_verified=True),ensure_ascii=False,indent=2))
print('Audio complete',count,'failures',len(failures),flush=True)
if failures:raise SystemExit('Neural audio is incomplete; do not publish as complete.')
