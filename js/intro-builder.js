/* === 이에요/예요 Sentence Builder === */

(async () => {
  const data = await App.loadVocab();
  const intro = data.intro;

  /* --- State --- */
  let topicIdx = 0;
  let nounIdx = 0;

  /* --- DOM --- */
  const topicBlock = document.getElementById('block-topic');
  const nounBlock = document.getElementById('block-noun');
  const sentenceEl = document.getElementById('full-sentence');
  const translationEl = document.getElementById('translation');
  const ttsBtn = document.getElementById('tts-btn');

  /* --- Particle helper --- */
  function getParticle(word) {
    return App.hasJongseong(word[word.length - 1]) ? '이에요' : '예요';
  }

  /* --- Filter nouns compatible with current topic --- */
  function compatibleNouns() {
    const topic = intro.topics[topicIdx];
    if (!topic.compatibleNounTypes) return intro.nouns;
    return intro.nouns.filter(n => topic.compatibleNounTypes.includes(n.category));
  }

  /* --- Render --- */
  function render() {
    const topic = intro.topics[topicIdx];
    const compat = compatibleNouns();
    if (nounIdx >= compat.length) nounIdx = 0;
    const noun = compat[nounIdx];

    // Topic block
    topicBlock.querySelector('.block-kr').textContent = topic.kr;
    topicBlock.querySelector('.block-rom').textContent = topic.rom;
    topicBlock.querySelector('.block-en').textContent = topic.en;

    // Noun block — show noun + particle
    const particle = getParticle(noun.kr);
    nounBlock.querySelector('.block-kr').textContent = noun.kr + particle;
    nounBlock.querySelector('.block-rom').textContent = noun.rom;
    nounBlock.querySelector('.block-en').textContent = noun.en;

    // Full sentence
    const fullKr = topic.kr + ' ' + noun.kr + particle + '.';
    sentenceEl.textContent = fullKr;

    // Translation
    const topicEn = topic.en.replace(' (topic)', '');
    translationEl.textContent = buildEnglish(topicEn, noun.en, particle);
  }

  function buildEnglish(topicEn, nounEn, particle) {
    if (topicEn === 'I') return 'I am ' + addArticle(nounEn) + '.';
    if (topicEn === 'This place') return 'This place is ' + addArticle(nounEn) + '.';
    if (topicEn === 'This thing') return 'This is ' + nounEn + '.';
    if (topicEn === 'My name') return 'My name is ' + nounEn + '.';
    return topicEn + ' is ' + nounEn + '.';
  }

  function addArticle(en) {
    const lower = en.toLowerCase();
    if (/^(a |an |the |my )/.test(lower)) return en;
    if (/person$/.test(lower)) return 'a ' + en;
    if (/^[aeiou]/i.test(en)) return 'an ' + en;
    return 'a ' + en;
  }

  /* --- Block click handlers --- */
  topicBlock.addEventListener('click', () => {
    topicIdx = (topicIdx + 1) % intro.topics.length;
    nounIdx = 0;
    App.pulseBlock(topicBlock);
    render();
  });

  nounBlock.addEventListener('click', () => {
    const compat = compatibleNouns();
    if (compat.length <= 1) return;
    nounIdx = (nounIdx + 1) % compat.length;
    App.pulseBlock(nounBlock);
    render();
  });

  /* --- TTS for full sentence --- */
  ttsBtn.addEventListener('click', () => {
    const topic = intro.topics[topicIdx];
    const compat = compatibleNouns();
    const noun = compat[nounIdx] || compat[0];
    const particle = getParticle(noun.kr);
    App.speak(topic.kr + ' ' + noun.kr + particle);
  });

  /* --- Add TTS buttons to blocks --- */
  function addTtsBtn(blockEl) {
    const btn = document.createElement('button');
    btn.className = 'block-tts-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 010 7.07" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round"/></svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kr = blockEl.querySelector('.block-kr').textContent;
      App.speak(kr);
    });
    blockEl.appendChild(btn);
  }

  [topicBlock, nounBlock].forEach(addTtsBtn);

  /* --- Block colors --- */
  topicBlock.style.background = 'var(--block-subject)';
  topicBlock.style.color = '#fff';
  nounBlock.style.background = 'var(--block-verb)';
  nounBlock.style.color = '#fff';

  /* --- Initial render --- */
  render();
})();
