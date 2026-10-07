from pathlib import Path
import json,re,collections,sys,os
ROOT=Path(os.getenv('OUTPUT_ROOT','.')).resolve();S=ROOT/'students';words=json.loads((S/'shared/vocabulary.json').read_text())
forms={}
def add(s,k):
 if s:forms.setdefault(s,k)
def final(s,tail):
 if not s or not '가'<=s[-1]<='힣':return s
 n=ord(s[-1])-44032
 if n%28:return s
 return s[:-1]+chr(44032+n+tail)
for w in words:
 k=w['ko'];add(k,k)
 for s in [w['yo'],*w['aliases']]:
  for a in s.split(' / '):add(a,k)
 if w['yo'] and k.endswith('다'):
  stem=k[:-1];add(stem,k);add(final(stem,4),k);add(final(stem,8),k)
  for yo in w['yo'].split(' / '):
   if yo.endswith('요'):
    a=yo[:-1];add(a,k);add(final(a,20),k)
    if a.endswith('어') or a.endswith('아'):add(a[:-1],k)
  if stem.endswith('ㅂ'):pass
  if stem and (ord(stem[-1])-44032)%28==17 and w['yo'].endswith('워요'):add(w['yo'][:-2]+'운',k)
manual={'누가':'누구','뭘':'뭐','뭔가':'뭐','이건':'이것','이거':'이것','제가':'저','제':'저','저의':'저','내가':'나','내':'나','교수님':'교수','알려':'알려주다','도와':'돕다','도운':'돕다','걷':'걷다','걸':'걷다','들':'듣다','들었':'듣다','두꺼':'두껍다','고른':'고르다','다른':'다르다','가까운':'가깝다','그다음':'다음','좋아지':'좋다','쉬워지':'쉽다','많아지':'많다','아니라':'아니다','무엇':'무엇','할':'하다','할게':'하다','만났':'만나다','마셨':'마시다','갔':'가다','왔':'오다','보냈':'보내다','썼':'쓰다','봤':'보다','배웠':'배우다','드렸':'드리다','바빠':'바쁘다','바빴':'바쁘다','없었':'없다','있었':'있다','줬':'주다','됐':'되다','했':'하다','사세요':'살다','쉬워져':'쉽다'}
for s,k in manual.items():
 if k in {w['ko'] for w in words}:forms[s]=k
suffixes='서 야 려면 들 밖에 이 가 은 는 을 를 에 에서 에게 한테 으로 로 도 만 과 와 하고 랑 이랑 까지 부터 께 께서 의 보다 에는 에도 에서는 에게도 에서도 한테도 으로도 로도 예요 이에요 요 고 면 으면 어서 아서 해서 기 전에 나서 는데 ㄴ데 은데 지만 으면서 면서 어야 아야 해야 거든요 고요 네요 나요 까요 을까요 을게요 게요 게 느라고 었 았 였 어요 아요 해요 습니다 ㅂ니다 시 겠 세요 라고 다가 다 는군요 드려 드릴래 수 있어요 거예요 주시겠어요 주다 게서 는지 지 지요 으세요 기는 기가 기를'.split()
allowed=re.compile('^(?:'+'|'.join(sorted(set(suffixes),key=len,reverse=True))+')+$')
fragments=set('이 가 은 는 을 를 에 에서 으로 로 도 만 의 에게 한테 아요 어요 해요 요 다 으 이에요 예요 세요 시 고 면 으면 았 었 와 과 하고 이랑 랑 까지 이라고 라고 님 게 도록 에서부터 께서 기 나서 아 어 아야 어야 거예요 습니다 ㅂ니다'.split())
ordered=sorted(forms,key=len,reverse=True);corpus={}
for w in words:corpus[w['id']+'-example']=w['example']
for a in S.iterdir():
 if not (a/'data.json').exists():continue
 d=json.loads((a/'data.json').read_text())
 for q in d['questions']:corpus[a.name+'-q-'+q['id']]=q.get('ko','')
 for p in d['patterns']:
  for i,e in enumerate(p['examples']):corpus[a.name+'-'+p['id']+'-'+str(i)]=e['ko']
sys.path.insert(0,str(Path(__file__).resolve().parent));import curriculum as C
for k,m in C.MODULES.items():
 for i,t in enumerate(m['translation']):corpus[k+'-answer-'+str(i)]=t['ko']
unresolved=collections.defaultdict(list);mapped={}
for key,text in corpus.items():
 for token in re.findall('[가-힣]+',text):
  match=forms.get(token)
  if not match and token in fragments:match='[grammar]'
  if not match:
   for f in ordered:
    if token.startswith(f) and allowed.fullmatch(token[len(f):] or '\0'):match=forms[f];break
  if not match:unresolved[token].append(key)
  else:mapped[token]=match
out=dict(method='Explicit surface forms and manually reviewed suffix mapping; not a general morphological analyzer.',corpusEntries=len(corpus),mappedSurfaces=len(mapped),unresolved=dict(unresolved))
(ROOT/'vocabulary-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(dict(unresolved),ensure_ascii=False,indent=2))
if unresolved:raise SystemExit('Unresolved vocabulary must be reviewed before publication.')
