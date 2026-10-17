/* Sentence-pattern practice items for Alice B.
   Every word comes from her vocabulary list; every pattern from her lessons.
   Each item: pattern, en (English meaning), tiles (correct order), accept (other correct orders), distract (one wrong tile). */
(function () {
  function batchim(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return false;
    return (c - 0xac00) % 28 !== 0;
  }
  const obj = (w) => w + (batchim(w) ? '을' : '를');
  const subj = (w) => w + (batchim(w) ? '이' : '가');
  const wrongObj = (w) => w + (batchim(w) ? '이' : '가');
  const wrongSubj = (w) => w + (batchim(w) ? '을' : '를');

  // verb forms: [present, past, future, want]
  const V = {
    가다: ['가요', '갔어요', '갈 거예요', '가고 싶어요'],
    먹다: ['먹어요', '먹었어요', '먹을 거예요', '먹고 싶어요'],
    마시다: ['마셔요', '마셨어요', '마실 거예요', '마시고 싶어요'],
    읽다: ['읽어요', '읽었어요', '읽을 거예요', '읽고 싶어요'],
    사다: ['사요', '샀어요', '살 거예요', '사고 싶어요'],
    만들다: ['만들어요', '만들었어요', '만들 거예요', '만들고 싶어요'],
    보다: ['봐요', '봤어요', '볼 거예요', '보고 싶어요'],
    듣다: ['들어요', '들었어요', '들을 거예요', '듣고 싶어요'],
    좋아하다: ['좋아해요', '좋아했어요', '좋아할 거예요', ''],
    공부하다: ['공부해요', '공부했어요', '공부할 거예요', '공부하고 싶어요'],
    운동하다: ['운동해요', '운동했어요', '운동할 거예요', '운동하고 싶어요'],
    청소하다: ['청소해요', '청소했어요', '청소할 거예요', '청소하고 싶어요'],
    일하다: ['일해요', '일했어요', '일할 거예요', '일하고 싶어요'],
    쉬다: ['쉬어요', '쉬었어요', '쉴 거예요', '쉬고 싶어요'],
    연습하다: ['연습해요', '연습했어요', '연습할 거예요', '연습하고 싶어요'],
    산책하다: ['산책해요', '산책했어요', '산책할 거예요', '산책하고 싶어요']
  };
  const VEN = {
    가다: ['go', 'went', 'will go', 'want to go'],
    먹다: ['eat', 'ate', 'will eat', 'want to eat'],
    마시다: ['drink', 'drank', 'will drink', 'want to drink'],
    읽다: ['read', 'read', 'will read', 'want to read'],
    사다: ['buy', 'bought', 'will buy', 'want to buy'],
    만들다: ['make', 'made', 'will make', 'want to make'],
    보다: ['watch', 'watched', 'will watch', 'want to watch'],
    듣다: ['listen to', 'listened to', 'will listen to', 'want to listen to'],
    좋아하다: ['like', 'liked', 'will like', ''],
    공부하다: ['study', 'studied', 'will study', 'want to study'],
    운동하다: ['exercise', 'exercised', 'will exercise', 'want to exercise'],
    청소하다: ['clean', 'cleaned', 'will clean', 'want to clean'],
    일하다: ['work', 'worked', 'will work', 'want to work'],
    쉬다: ['rest', 'rested', 'will rest', 'want to rest'],
    연습하다: ['practice', 'practiced', 'will practice', 'want to practice'],
    산책하다: ['take a walk', 'took a walk', 'will take a walk', 'want to take a walk']
  };

  const items = [];
  const add = (pattern, en, tiles, distract, accept) =>
    items.push({ pattern, en, tiles, distract, accept: accept || [] });
  const swapFirstTwo = (t) => [[t[1], t[0], ...t.slice(2)]];

  // 1. N에 가요 / 갔어요 / 갈 거예요  (place + 에 + 가다, with time)
  const places = [['회사', 'work'], ['헬스장', 'the gym'], ['교회', 'church'], ['마트', 'the supermarket'], ['카페', 'a cafe'],
    ['도서관', 'the library'], ['공원', 'the park'], ['시장', 'the market'], ['식당', 'a restaurant'], ['한국', 'Korea'], ['프랑스', 'France']];
  const times = [['오늘', 'today', 0], ['어제', 'yesterday', 1], ['내일', 'tomorrow', 2], ['주말에', 'on the weekend', 0], ['토요일에', 'on Saturday', 2], ['아침에', 'in the morning', 0]];
  places.forEach(([p, pe], i) => {
    const [t, te, tense] = times[i % times.length];
    const tiles = ['저는', t, p + '에', V.가다[tense]];
    add('N에 가요 · 갔어요 · 갈 거예요', `I ${t === '오늘' ? "'m going" : ' ' + VEN.가다[tense]} to ${pe} ${te}.`.replace("I 'm", "I'm").replace('I  ', 'I '), tiles, p + '에서', swapFirstTwo(tiles));
  });

  // 2. N에서 + N을/를 + V  (doing something at a place)
  const acts = [['카페', 'the cafe', '커피', 'coffee', '마시다'], ['집', 'home', '파스타', 'pasta', '만들다'], ['도서관', 'the library', '책', 'a book', '읽다'],
    ['마트', 'the supermarket', '과일', 'fruit', '사다'], ['식당', 'a restaurant', '김밥', 'gimbap', '먹다'], ['집', 'home', '드라마', 'a drama', '보다'],
    ['시장', 'the market', '오이', 'cucumbers', '사다'], ['회사', 'the office', '한국어', 'Korean', '공부하다'], ['정원', 'the garden', '바나나', 'a banana', '먹다'],
    ['카페', 'a cafe', '케이크', 'cake', '먹다'], ['교회', 'church', '음악', 'music', '듣다'], ['집', 'home', '빵', 'bread', '만들다']];
  acts.forEach(([pl, ple, o, oe, v], i) => {
    const tense = i % 3;
    const tiles = ['저는', pl + '에서', obj(o), V[v][tense]];
    add('N에서 + N을/를 + verb', `I ${VEN[v][tense]} ${oe} ${ple === 'the garden' ? 'in' : 'at'} ${ple}.`, tiles, pl + '에', swapFirstTwo(tiles));
  });

  // 3. N에서 + verb (no object)
  [['헬스장', 'the gym', '운동하다'], ['공원', 'the park', '산책하다'], ['회사', 'the office', '일하다'], ['집', 'home', '쉬다'], ['교회', 'church', '연습하다'], ['집', 'home', '청소하다']]
    .forEach(([pl, ple, v], i) => {
      const tense = i % 3;
      const tiles = ['저는', pl + '에서', V[v][tense]];
      add('N에서 + verb', `I ${VEN[v][tense]} at ${ple}.`, tiles, pl + '에', swapFirstTwo(tiles));
    });

  // 4. N을/를 좋아해요 / 안 + verb / frequency + verb
  [['커피', 'coffee'], ['김치', 'kimchi'], ['피자', 'pizza'], ['고양이', 'cats'], ['드라마', 'dramas'], ['아이스크림', 'ice cream'], ['양궁', 'archery'], ['음악', 'music']]
    .forEach(([o, oe]) => add('N을/를 좋아해요', `I like ${oe}.`, ['저는', obj(o), '좋아해요'], wrongObj(o)));
  [['술', 'alcohol', '마시다'], ['고기', 'meat', '먹다'], ['라면', 'ramen', '먹다'], ['영화', 'movies', '보다'], ['커피', 'coffee', '마시다']]
    .forEach(([o, oe, v]) => add('안 + verb (not)', `I don't ${VEN[v][0]} ${oe}.`, ['저는', obj(o), '안', V[v][0]], wrongObj(o)));
  const freq = [['항상', 'always'], ['보통', 'usually'], ['자주', 'often'], ['가끔', 'sometimes']];
  [['커피', 'coffee', '마시다'], ['한국어', 'Korean', '공부하다'], ['책', 'books', '읽다'], ['음악', 'music', '듣다'], ['파스타', 'pasta', '만들다'], ['과일', 'fruit', '먹다'], ['드라마', 'dramas', '보다'], ['차', 'tea', '마시다']]
    .forEach(([o, oe, v], i) => {
      const [f, fe] = freq[i % 4];
      add('항상 · 보통 · 자주 · 가끔 + verb', `I ${fe} ${VEN[v][0]} ${oe}.`, ['저는', f, obj(o), V[v][0]], wrongObj(o), [['저는', obj(o), f, V[v][0]]]);
    });

  // 5. N이/가 + adjective
  [['날씨', 'The weather', '좋아요', 'is nice'], ['집', 'The house', '커요', 'is big'], ['김치', 'Kimchi', '맛있어요', 'is delicious'], ['커피', 'The coffee', '달아요', 'is sweet'],
    ['방', 'The room', '깨끗해요', 'is clean'], ['한국어', 'Korean', '어려워요', 'is difficult'], ['가방', 'The bag', '무거워요', 'is heavy'], ['고양이', 'The cat', '예뻐요', 'is pretty'],
    ['드라마', 'The drama', '재미있어요', 'is fun'], ['오늘 날씨', "Today's weather", '추워요', 'is cold']]
    .forEach(([n, ne, a, ae]) => add('N이/가 + adjective', `${ne} ${ae}.`, [subj(n), a], wrongSubj(n)));

  // 6. Place + 에 + N이/가 있어요
  [['침실', 'the bedroom', '침대', 'a bed'], ['부엌', 'the kitchen', '식탁', 'a dining table'], ['거실', 'the living room', '소파', 'a sofa'], ['정원', 'the garden', '나무', 'a tree'],
    ['화장실', 'the bathroom', '세면대', 'a sink'], ['방', 'my room', '창문', 'a window'], ['책상 위', 'the desk', '컵', 'a cup'], ['가방 안', 'the bag', '열쇠', 'a key']]
    .forEach(([pl, ple, n, ne]) => add('N에 N이/가 있어요', `There is ${ne} ${pl.includes(' 위') ? 'on' : 'in'} ${ple}.`, [pl + '에', subj(n), '있어요'], pl + '에서'));

  // 7. V-고 싶어요
  [['한국', 'Korea', '가다', null], ['김치', 'kimchi', '먹다', 'o'], ['옷', 'clothes', '만들다', 'o'], ['한국 드라마', 'Korean dramas', '보다', 'o'], ['새 책', 'a new book', '사다', 'o'], ['집', 'home', '쉬다', 'place']]
    .forEach(([n, ne, v, kind]) => {
      if (kind === 'o') add('V-고 싶어요 (want to)', `I want to ${VEN[v][0]} ${ne}.`, ['저는', obj(n), V[v][3]], wrongObj(n));
      else if (kind === 'place') add('V-고 싶어요 (want to)', `I want to rest at ${ne}.`, ['저는', n + '에서', V[v][3]], n + '에');
      else add('V-고 싶어요 (want to)', `I want to go to ${ne}.`, ['저는', n + '에', V[v][3]], n + '에서');
    });

  // 8. Fixed sentences from lesson patterns (because, before, when, and, but, with, every)
  const fixed = [
    ['V-기 전에 (before)', 'I wash my hands before I sleep.', ['자기 전에', '손을', '씻어요'], '자기 후에'],
    ['V-기 전에 (before)', 'I drink water before I eat.', ['먹기 전에', '물을', '마셔요'], '물이'],
    ['A/V-아서/어서 (because)', "I'm hungry, so I eat bread.", ['배고파서', '빵을', '먹어요'], '배고프고'],
    ['A/V-아서/어서 (because)', "I'm tired, so I rest.", ['피곤해서', '쉬어요'], '피곤하고'],
    ['N 때문에 (because of)', "It's hard because of work.", ['일 때문에', '힘들어요'], '일하고'],
    ['A/V-고 (and)', "It's hot and sunny these days.", ['요즘', '덥고', '맑아요'], '더워서'],
    ['A/V-고 (and)', 'I clean and then rest.', ['청소하고', '쉬어요'], '청소해서'],
    ['A/V-지만 (but)', 'Kimchi is delicious but expensive.', ['김치가', '맛있지만', '비싸요'], '맛있고'],
    ['A/V-지만 (but)', 'Korean is difficult but fun.', ['한국어가', '어렵지만', '재미있어요'], '어렵고'],
    ['N하고 (with)', 'I go to the supermarket with my son.', ['저는', '아들하고', '마트에', '가요'], '아들을', [['아들하고', '저는', '마트에', '가요']]],
    ['N하고 (and)', 'I eat bread and fruit.', ['저는', '빵하고', '과일을', '먹어요'], '빵을'],
    ['N마다 (every)', 'I clean every weekend.', ['주말마다', '청소해요'], '주말에서'],
    ['매일 (every day)', 'I study Korean every day.', ['저는', '매일', '한국어를', '공부해요'], '한국어가', [['매일', '저는', '한국어를', '공부해요']]],
    ['V-(으)ㄹ 때 (when)', 'When it rains, I stay home.', ['비가 올 때', '집에', '있어요'], '집에서'],
    ['A/V-(으)면 (if)', 'If I go home, I eat.', ['집에 가면', '밥을', '먹어요'], '밥이'],
    ['time + 에는 (contrast)', "It's hot in the daytime. It's cold at night.", ['낮에는', '더워요.', '밤에는', '추워요.'], '낮에서'],
    ['N이/가 어때요? (how is …?)', 'How is the weather today?', ['오늘', '날씨가', '어때요?'], '날씨를'],
    ['몇 + counter (how many)', 'How many cats do you have?', ['고양이가', '몇 마리', '있어요?'], '몇 개'],
    ['N(으)로 (by / with)', 'I make clothes with a sewing machine.', ['재봉틀로', '옷을', '만들어요'], '재봉틀에'],
    ['N에게/한테 + 주다 (give to)', 'I give coffee to my friend.', ['친구한테', '커피를', '줘요'], '친구를'],
    ['V-고 있어요 (am doing)', "I'm drinking coffee.", ['커피를', '마시고 있어요'], '커피가'],
    ['N보다 더 (more than)', "I'm busier than usual.", ['평소보다', '더', '바빠요'], '평소에'],
    ['N도 (also)', 'There is also a bathtub.', ['욕조도', '있어요'], '욕조를'],
    ['N의 (of)', "The cat's name is Dracula.", ['고양이의', '이름은', '드라큘라예요'], '고양이를'],
    ['V-(으)러 가요 (go to do)', "Let's go eat together.", ['같이', '먹으러', '가요'], '먹어서'],
    ['언제부터 (since when)', 'Since when were you sick?', ['언제부터', '아팠어요?'], '언제에']
  ];
  fixed.forEach((f) => add(f[0], f[1], f[2], f[3], f[4]));

  window.SENTENCES = items;
})();
