const data = window.CHEN_READING_APP_DATA;
const storageKey = "chen-reading-flashcards-progress-v1";
const revealKey = "chen-reading-flashcards-reveals-v1";

const state = {
  view: "topics",
  homeTab: "topics",
  topicId: 1,
  homeWordScope: "unknown",
  filter: "unknown",
  vocabMode: "list",
  cardLayout: "list",
  vocabReturnView: "topics",
  topicSearch: "",
  cardSearch: "",
  audio: null,
  progress: {},
  revealed: {},
  quiz: {
    active: false,
    deck: [],
    index: 0,
    revealed: false,
    correct: 0,
    reviewed: 0,
    filter: "unknown",
  },
};

const cardsById = new Map(data.cards.map((card) => [card.id, card]));
const topicsById = new Map(data.topics.map((topic) => [topic.id, topic]));

function initialProgress() {
  return Object.fromEntries(data.cards.map((card) => [card.id, card.initialStatus]));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.progress = { ...initialProgress(), ...saved };
  } catch {
    state.progress = initialProgress();
  }
  try {
    state.revealed = JSON.parse(localStorage.getItem(revealKey) || "{}");
  } catch {
    state.revealed = {};
  }
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(state.progress));
  localStorage.setItem(revealKey, JSON.stringify(state.revealed));
}

function currentTopic() {
  return topicsById.get(state.topicId) || data.topics[0];
}

function globalUnknownCount() {
  return Object.values(state.progress).filter((status) => status === "unknown").length;
}

function unknownCountForFilter(filter) {
  return cardIdsForFilter(filter).filter((id) => state.progress[id] === "unknown").length;
}

function statusCountsForFilter(filter) {
  return cardIdsForFilter(filter).reduce((counts, id) => {
    const status = state.progress[id] || "unchecked";
    counts[status] = (counts[status] || 0) + 1;
    counts.all += 1;
    return counts;
  }, { known: 0, unknown: 0, unchecked: 0, all: 0 });
}

function unknownCardIds() {
  return data.cards.filter((card) => state.progress[card.id] === "unknown").map((card) => card.id);
}

function cardIdsForFilter(filter) {
  const topic = currentTopic();
  if (filter === "all") {
    return data.cards.map((card) => card.id);
  }
  if (filter === "unknown") {
    return unknownCardIds();
  }
  if (filter === "unchecked") {
    return data.cards.filter((card) => state.progress[card.id] === "unchecked").map((card) => card.id);
  }
  return topic.cardIds;
}

function cardsForFilter(filter) {
  return cardIdsForFilter(filter).map((id) => cardsById.get(id)).filter(Boolean);
}

function filterLabel(filter) {
  if (filter === "topic") {
    const topic = currentTopic();
    return `${topic.id}. ${topic.title}`;
  }
  if (filter === "unknown") return "Unknown only";
  if (filter === "unchecked") return "Unchecked only";
  if (filter === "all") return "All words";
  return filter;
}

function quizUnknownLabel() {
  const unknown = unknownCountForFilter(state.quiz.filter);
  return state.quiz.filter === "unknown" ? `${unknown} in tray` : `${unknown} unknown in set`;
}

function shuffled(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function resetQuizSession() {
  state.quiz = {
    active: false,
    deck: [],
    index: 0,
    revealed: false,
    correct: 0,
    reviewed: 0,
    filter: state.filter,
  };
}

function setView(view) {
  state.view = view;
  if (view !== "vocab") {
    resetQuizSession();
  }
  renderAll();
  window.scrollTo(0, 0);
}

function openVocabulary(filter = "unknown", returnView = "topics") {
  state.view = "vocab";
  state.filter = filter;
  state.vocabMode = "list";
  state.cardLayout = "list";
  state.vocabReturnView = returnView;
  state.cardSearch = "";
  resetQuizSession();
  renderAll();
  window.scrollTo(0, 0);
}

function startQuiz(filter = state.filter, returnView = state.vocabReturnView) {
  state.view = "vocab";
  state.filter = filter;
  state.vocabMode = "test";
  state.cardLayout = "list";
  state.vocabReturnView = returnView;
  state.quiz = {
    active: true,
    deck: shuffled(cardIdsForFilter(filter)),
    index: 0,
    revealed: false,
    correct: 0,
    reviewed: 0,
    filter,
  };
  state.cardSearch = "";
  renderAll();
  window.scrollTo(0, 0);
}

function setVocabularyMode(mode) {
  state.vocabMode = mode;
  state.cardLayout = mode === "cards" ? "cards" : "list";
  resetQuizSession();
  renderAll();
}

function currentQuizCard() {
  return cardsById.get(state.quiz.deck[state.quiz.index]);
}

function advanceQuiz() {
  state.quiz.index += 1;
  state.quiz.revealed = false;
}

function answerQuiz(status) {
  const card = currentQuizCard();
  if (!card) return;
  if (status === "known") {
    state.progress[card.id] = "known";
    state.quiz.correct += 1;
  } else if (status === "unknown") {
    state.progress[card.id] = "unknown";
    state.revealed[card.id] = true;
  }
  state.quiz.reviewed += 1;
  advanceQuiz();
  saveProgress();
  renderAll();
}

function playAudio(path, label) {
  const player = document.getElementById("audioPlayer");
  const audioState = document.getElementById("audioState");
  const audioLabel = document.getElementById("audioLabel");
  const audioDock = document.getElementById("audioDock");

  if (state.audio && state.audio !== player) {
    state.audio.pause();
  }
  state.audio = player;
  audioDock.hidden = false;
  audioLabel.textContent = label;
  player.pause();
  player.src = path;
  player.load();
  audioState.textContent = "Playing";
  player.onended = () => {
    audioState.textContent = "Ready";
  };
  player.onerror = () => {
    audioState.textContent = "Missing audio";
    console.warn(`Audio failed: ${label}`, path);
  };
  player.play().catch(() => {
    audioState.textContent = "Use controls";
  });
}

function syncControls() {
  document.getElementById("topicSearch").value = state.topicSearch;
  document.getElementById("cardSearch").value = state.cardSearch;
  document.getElementById("cardFilter").value = state.filter;
  const homeTopicSelect = document.getElementById("homeTopicSelect");
  if (homeTopicSelect.options.length !== data.topics.length) {
    homeTopicSelect.innerHTML = data.topics.map((topic) => `<option value="${topic.id}">${topic.id}. ${topic.title}</option>`).join("");
  }
  homeTopicSelect.value = String(state.topicId);
  homeTopicSelect.hidden = state.homeWordScope !== "topic";
  homeTopicSelect.disabled = state.homeWordScope !== "topic";
  document.getElementById("homeWordScope").value = state.homeWordScope;

  document.getElementById("showTopicTab").setAttribute("aria-pressed", state.homeTab === "topics" ? "true" : "false");
  document.getElementById("showWordTab").setAttribute("aria-pressed", state.homeTab === "words" ? "true" : "false");
  document.getElementById("topicHomePanel").hidden = state.homeTab !== "topics";
  document.getElementById("wordHomePanel").hidden = state.homeTab !== "words";
  document.getElementById("homeSectionLabel").textContent = state.homeTab === "topics" ? "Reading Topics" : "Vocabulary";
  document.getElementById("homeHeading").textContent = state.homeTab === "topics" ? "Choose a topic" : "Choose words";

  document.getElementById("showListMode").setAttribute("aria-pressed", state.vocabMode === "list" ? "true" : "false");
  document.getElementById("showCardMode").setAttribute("aria-pressed", state.vocabMode === "cards" ? "true" : "false");
  document.getElementById("startQuiz").setAttribute("aria-pressed", state.vocabMode === "test" ? "true" : "false");
  document.getElementById("cardSearch").hidden = state.vocabMode === "test";
  const titleByMode = { list: "Word List", cards: "Flashcards", test: "Word Test" };
  document.getElementById("vocabModeTitle").textContent = titleByMode[state.vocabMode] || "Word List";
  document.getElementById("backFromVocab").textContent = state.vocabReturnView === "reading" ? "Reading" : "Topics";
}

function renderViews() {
  document.getElementById("topicView").hidden = state.view !== "topics";
  document.getElementById("readingView").hidden = state.view !== "reading";
  document.getElementById("vocabView").hidden = state.view !== "vocab";
}

function renderTopics() {
  const list = document.getElementById("topicList");
  const q = state.topicSearch.trim().toLowerCase();
  const topics = data.topics.filter((topic) => {
    if (!q) return true;
    return `${topic.id} ${topic.title} ${topic.group}`.toLowerCase().includes(q);
  });
  if (!topics.length) {
    list.innerHTML = `<div class="empty-state">No matching topics.</div>`;
    return;
  }
  list.innerHTML = topics.map((topic) => {
    const active = topic.id === state.topicId ? "active" : "";
    return `
      <article class="topic-card ${active}" data-topic-card-id="${topic.id}">
        <button class="topic-open" data-topic-id="${topic.id}" type="button">
          <span class="topic-num">${topic.id}</span>
          <span class="topic-name"><strong>${topic.title}</strong><span>${topic.group}</span></span>
        </button>
        <button class="topic-play" type="button" data-topic-audio="${topic.audio}" data-label="${topic.id}. ${topic.title}" aria-label="Play topic ${topic.id} audio">&#9654;</button>
      </article>
    `;
  }).join("");
}

function renderHomeWordPreview() {
  const summary = document.getElementById("homeWordSummary");
  const countsEl = document.getElementById("homeWordCounts");
  const preview = document.getElementById("homeWordPreview");
  const cards = cardsForFilter(state.homeWordScope);
  const counts = statusCountsForFilter(state.homeWordScope);
  const shown = cards.slice(0, 18);
  summary.textContent = `${filterLabel(state.homeWordScope)} - ${cards.length} words shown in this set`;
  countsEl.innerHTML = `
    <span><strong>${counts.known}</strong> Known</span>
    <span><strong>${counts.unknown}</strong> Unknown</span>
    <span><strong>${counts.unchecked}</strong> Unchecked</span>
    <span><strong>${counts.all}</strong> All</span>
  `;
  if (!shown.length) {
    preview.innerHTML = `<div class="empty-state">No words in this set.</div>`;
    return;
  }
  preview.innerHTML = shown.map((card) => {
    const status = state.progress[card.id] || "unchecked";
    return `
      <div class="word-preview-row ${status}">
        <span class="word-preview-main">${card.display}</span>
        <span class="word-preview-meaning">${card.meaning}</span>
        <span class="word-preview-status">${status}</span>
      </div>
    `;
  }).join("");
}

function renderReading() {
  const topic = currentTopic();
  document.getElementById("topicGroup").textContent = topic.group;
  document.getElementById("topicTitle").textContent = `${topic.id}. ${topic.title}`;
  document.getElementById("sentenceList").innerHTML = topic.sentences.map((sentence) => `
    <div class="sentence-row">
      <div class="sentence-index">${sentence.index}</div>
      <div class="sentence-text">${sentence.text}</div>
      <button class="play-sentence" type="button" data-audio="${sentence.audio}" data-label="${topic.id}.${sentence.index}" aria-label="Play sentence ${sentence.index}">&#9654;</button>
    </div>
  `).join("");
}

function renderVocabularySummaryLegacy() {
  const topic = currentTopic();
  const summary = document.getElementById("vocabSummary");
  if (state.vocabMode === "test" && state.quiz.active) {
    const total = state.quiz.deck.length;
    summary.textContent = `${filterLabel(state.quiz.filter)} test - ${state.quiz.reviewed}/${total} reviewed - ${globalUnknownCount()} unknown`;
    return;
  }
  const filteredCount = filteredCards().length;
  const label = state.filter === "topic" ? `${topic.id}. ${topic.title}` : state.filter.replace("-", " ");
  summary.textContent = `${filteredCount} shown · ${globalUnknownCount()} unknown · ${label}`;
}

function filteredCards() {
  const query = state.cardSearch.trim().toLowerCase();
  return cardsForFilter(state.filter)
    .filter((card) => {
      if (!query) return true;
      const haystack = [card.display, card.meaning, card.category, ...(card.variants || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

function renderCards() {
  const list = document.getElementById("cardList");
  if (state.vocabMode === "test") {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }
  list.hidden = false;
  const cards = filteredCards();
  list.className = state.cardLayout === "list" ? "card-list compact" : "card-list";
  if (!cards.length) {
    list.innerHTML = `<div class="empty-state">No cards in this view.</div>`;
    return;
  }
  if (state.cardLayout === "list") {
    list.innerHTML = cards.map((card) => {
      const status = state.progress[card.id] || "unchecked";
      const topics = card.topicIds.join(", ");
      const variants = card.variants.filter((v) => v !== card.display).join(" · ");
      return `
        <article class="vocab-card vocab-row ${status}" data-card-id="${card.id}">
          <div class="vocab-row-main">
            <div class="vocab-word">${card.display}</div>
            <div class="vocab-meta">Topic ${topics}${variants ? ` · ${variants}` : ""}</div>
          </div>
          <div class="vocab-row-meaning">${card.meaning}</div>
          <div class="card-actions row-actions">
            <button class="mini-button mark-known ${status === "known" ? "known-active" : ""}" type="button">Known</button>
            <button class="mini-button mark-unknown ${status === "unknown" ? "unknown-active" : ""}" type="button">Unknown</button>
          </div>
        </article>
      `;
    }).join("");
    return;
  }
  list.innerHTML = cards.map((card) => {
    const status = state.progress[card.id] || "unchecked";
    const revealed = !!state.revealed[card.id];
    const topics = card.topicIds.join(", ");
    const variants = card.variants.filter((v) => v !== card.display).join(" · ");
    return `
      <article class="vocab-card ${status}" data-card-id="${card.id}">
        <div class="vocab-top">
          <div>
            <div class="vocab-word">${card.display}</div>
            <div class="vocab-meta">Topic ${topics}${variants ? ` · ${variants}` : ""}</div>
          </div>
        </div>
        <div class="meaning ${revealed ? "" : "hidden"}">${revealed ? card.meaning : "Meaning hidden"}</div>
        <div class="card-actions">
          <button class="mini-button reveal" type="button">${revealed ? "Hide" : "Meaning"}</button>
          <button class="mini-button mark-known ${status === "known" ? "known-active" : ""}" type="button">Known</button>
          <button class="mini-button mark-unknown ${status === "unknown" ? "unknown-active" : ""}" type="button">Unknown</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderQuiz() {
  const panel = document.getElementById("quizPanel");
  if (!state.quiz.active || state.vocabMode !== "test") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  const total = state.quiz.deck.length;
  if (!total) {
    panel.innerHTML = `
      <div class="quiz-top">
        <div>
          <p class="section-label">Word Test</p>
          <h4>No words in this set</h4>
        </div>
      </div>
      <div class="quiz-empty">Choose List or Cards to browse another word set.</div>
    `;
    return;
  }

  while (state.quiz.filter === "unknown" && state.quiz.index < total && state.progress[state.quiz.deck[state.quiz.index]] !== "unknown") {
    state.quiz.index += 1;
    state.quiz.revealed = false;
  }

  if (state.quiz.index >= total) {
    const remaining = unknownCountForFilter(state.quiz.filter);
    panel.innerHTML = `
      <div class="quiz-top">
        <div>
          <p class="section-label">Word Test</p>
          <h4>Session complete</h4>
        </div>
      </div>
      <div class="quiz-result-grid">
        <div><strong>${state.quiz.reviewed}</strong><span>Reviewed</span></div>
        <div><strong>${state.quiz.correct}</strong><span>Moved to Known</span></div>
        <div><strong>${remaining}</strong><span>Still Unknown</span></div>
      </div>
      <div class="quiz-actions two">
        <button class="mini-button quiz-restart" type="button" data-quiz-action="restart">Test Again</button>
        <button class="mini-button quiz-restart" type="button" data-quiz-action="unknown" ${remaining ? "" : "disabled"}>Review Unknown</button>
      </div>
    `;
    return;
  }

  const card = currentQuizCard();
  if (!card) {
    panel.innerHTML = `
      <div class="quiz-empty">This quiz card could not be loaded.</div>
      <button class="mini-button" type="button" data-quiz-action="skip">Skip</button>
    `;
    return;
  }

  const progressLabel = `${state.quiz.index + 1} / ${total}`;
  const topics = card.topicIds.join(", ");
  const variants = card.variants.filter((v) => v !== card.display).join(" · ");
  const meaningText = state.quiz.revealed ? card.meaning : "Meaning hidden";

  panel.innerHTML = `
    <div class="quiz-top">
      <div>
        <p class="section-label">Word Test</p>
        <h4>${filterLabel(state.quiz.filter)}</h4>
      </div>
    </div>
    <div class="quiz-progress-row">
      <strong id="quizProgress">${progressLabel}</strong>
      <span>${quizUnknownLabel()}</span>
    </div>
    <article class="quiz-card" data-quiz-card-id="${card.id}">
      <div id="quizWord" class="quiz-word">${card.display}</div>
      <div class="quiz-meta">Topic ${topics}${variants ? ` · ${variants}` : ""}</div>
      <div id="quizMeaning" class="quiz-meaning ${state.quiz.revealed ? "" : "hidden"}">${meaningText}</div>
    </article>
    <div class="quiz-actions">
      <button id="quizReveal" class="mini-button quiz-reveal" type="button" data-quiz-action="reveal">${state.quiz.revealed ? "Hide Meaning" : "Reveal Meaning"}</button>
      <button id="quizKnow" class="mini-button quiz-know" type="button" data-quiz-action="know" ${state.quiz.revealed ? "" : "disabled"}>I know it</button>
      <button id="quizStill" class="mini-button quiz-still" type="button" data-quiz-action="still">Still unknown</button>
      <button id="quizSkip" class="mini-button quiz-skip" type="button" data-quiz-action="skip">Skip</button>
    </div>
  `;
}

function renderVocabularySummary() {
  const summary = document.getElementById("vocabSummary");
  if (state.vocabMode === "test" && state.quiz.active) {
    const total = state.quiz.deck.length;
    summary.textContent = `${filterLabel(state.quiz.filter)} test - ${state.quiz.reviewed}/${total} reviewed - ${unknownCountForFilter(state.quiz.filter)} unknown`;
    return;
  }
  const filteredCount = filteredCards().length;
  summary.textContent = `${filteredCount} shown - ${unknownCountForFilter(state.filter)} unknown - ${filterLabel(state.filter)}`;
}

function renderAll() {
  syncControls();
  renderViews();
  renderTopics();
  renderHomeWordPreview();
  renderReading();
  renderCards();
  renderVocabularySummary();
  renderQuiz();
}

function bindEvents() {
  document.getElementById("topicSearch").addEventListener("input", (event) => {
    state.topicSearch = event.target.value;
    renderTopics();
  });

  document.getElementById("openVocab").addEventListener("click", () => {
    openVocabulary("unknown", "topics");
  });

  document.getElementById("showTopicTab").addEventListener("click", () => {
    state.homeTab = "topics";
    renderAll();
  });

  document.getElementById("showWordTab").addEventListener("click", () => {
    state.homeTab = "words";
    renderAll();
  });

  document.getElementById("homeWordScope").addEventListener("change", (event) => {
    state.homeWordScope = event.target.value;
    renderAll();
  });

  document.getElementById("homeTopicSelect").addEventListener("change", (event) => {
    state.topicId = Number(event.target.value);
    renderAll();
  });

  document.getElementById("homeOpenPractice").addEventListener("click", () => {
    openVocabulary(state.homeWordScope, "topics");
  });

  document.getElementById("openTopicWords").addEventListener("click", () => {
    openVocabulary("topic", "reading");
  });

  document.getElementById("backToTopics").addEventListener("click", () => {
    setView("topics");
  });

  document.getElementById("backFromVocab").addEventListener("click", () => {
    setView(state.vocabReturnView);
  });

  document.getElementById("topicList").addEventListener("click", (event) => {
    const playButton = event.target.closest("[data-topic-audio]");
    if (playButton) {
      playAudio(playButton.dataset.topicAudio, playButton.dataset.label);
      return;
    }
    const openButton = event.target.closest("[data-topic-id]");
    if (!openButton) return;
    state.topicId = Number(openButton.dataset.topicId);
    state.filter = "topic";
    setView("reading");
  });

  document.getElementById("sentenceList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-audio]");
    if (!button) return;
    playAudio(button.dataset.audio, `Sentence ${button.dataset.label}`);
  });

  document.getElementById("playTopic").addEventListener("click", () => {
    const topic = currentTopic();
    playAudio(topic.audio, `${topic.id}. ${topic.title}`);
  });

  document.getElementById("cardSearch").addEventListener("input", (event) => {
    state.cardSearch = event.target.value;
    renderCards();
    renderVocabularySummary();
  });

  document.getElementById("cardFilter").addEventListener("change", (event) => {
    state.filter = event.target.value;
    state.vocabMode = "list";
    state.cardLayout = "list";
    resetQuizSession();
    renderAll();
  });

  document.getElementById("showListMode").addEventListener("click", () => setVocabularyMode("list"));

  document.getElementById("showCardMode").addEventListener("click", () => setVocabularyMode("cards"));

  document.getElementById("startQuiz").addEventListener("click", () => startQuiz(state.filter, state.vocabReturnView));

  document.getElementById("quizPanel").addEventListener("click", (event) => {
    const button = event.target.closest("[data-quiz-action]");
    if (!button) return;
    const action = button.dataset.quizAction;
    if (action === "restart") {
      startQuiz(state.quiz.filter, state.vocabReturnView);
    } else if (action === "unknown") {
      startQuiz("unknown", state.vocabReturnView);
    } else if (action === "reveal") {
      state.quiz.revealed = !state.quiz.revealed;
      renderQuiz();
    } else if (action === "know") {
      answerQuiz("known");
    } else if (action === "still") {
      answerQuiz("unknown");
    } else if (action === "skip") {
      advanceQuiz();
      renderAll();
    }
  });

  document.getElementById("resetProgress").addEventListener("click", () => {
    state.progress = initialProgress();
    state.revealed = {};
    resetQuizSession();
    saveProgress();
    renderAll();
  });

  document.getElementById("cardList").addEventListener("click", (event) => {
    const cardEl = event.target.closest("[data-card-id]");
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    if (event.target.classList.contains("reveal")) {
      state.revealed[cardId] = !state.revealed[cardId];
    } else if (event.target.classList.contains("mark-known")) {
      state.progress[cardId] = "known";
    } else if (event.target.classList.contains("mark-unknown")) {
      state.progress[cardId] = "unknown";
      state.revealed[cardId] = true;
    } else {
      return;
    }
    saveProgress();
    renderAll();
  });
}

loadState();
bindEvents();
renderAll();
