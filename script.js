const sentenceForm = document.getElementById('sentenceForm');
const sentenceUaInput = document.getElementById('sentenceUaInput');
const sentenceJaInput = document.getElementById('sentenceJaInput');
const sentenceList = document.getElementById('sentenceList');

const wordForm = document.getElementById('wordForm');
const wordUaInput = document.getElementById('wordUaInput');
const wordJaInput = document.getElementById('wordJaInput');
const wordReadingInput = document.getElementById('wordReadingInput');
const wordList = document.getElementById('wordList');

const dueCountEl = document.getElementById('dueCount');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const dirButtons = document.querySelectorAll('.dir-btn');
const flashcard = document.getElementById('flashcard');
const cardFront = document.getElementById('cardFront');
const cardBack = document.getElementById('cardBack');
const studyEmpty = document.getElementById('studyEmpty');
const ratingButtons = document.getElementById('ratingButtons');

let sentences = JSON.parse(localStorage.getItem('vocabSentences') || '[]');
let words = JSON.parse(localStorage.getItem('vocabWords') || '[]');
let direction = 'ua-ja';
let currentWord = null;
let isFlipped = false;

function saveSentences() {
  localStorage.setItem('vocabSentences', JSON.stringify(sentences));
}

function saveWords() {
  localStorage.setItem('vocabWords', JSON.stringify(words));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultSrs() {
  return { interval: 0, ease: 2.5, reps: 0, dueDate: todayStr() };
}

// --- Word splitting ---
function splitWords(text) {
  const matches = text.match(/[\p{L}\p{M}'’ʼ-]+/gu) || [];
  return [...new Set(matches.map((w) => w.toLowerCase()))];
}

function addWordsFromSentence(uaSentence) {
  const found = splitWords(uaSentence);
  found.forEach((ua) => {
    const exists = words.some((w) => w.ua.toLowerCase() === ua);
    if (!exists) {
      words.push({ id: makeId(), ua, ja: '', reading: '', note: '', srs: defaultSrs() });
    }
  });
  saveWords();
}

// --- Sentences ---
function renderSentences() {
  sentenceList.innerHTML = '';
  sentences.slice().reverse().forEach((sentence) => {
    const li = document.createElement('li');

    const ua = document.createElement('div');
    ua.className = 'sentence-ua';
    ua.textContent = sentence.ua;

    const ja = document.createElement('div');
    ja.className = 'sentence-ja';
    ja.textContent = sentence.ja;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => {
      sentences = sentences.filter((s) => s.id !== sentence.id);
      saveSentences();
      renderSentences();
    });

    li.appendChild(ua);
    li.appendChild(ja);
    li.appendChild(deleteBtn);
    sentenceList.appendChild(li);
  });
}

sentenceForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ua = sentenceUaInput.value.trim();
  const ja = sentenceJaInput.value.trim();
  if (!ua || !ja) return;

  sentences.push({ id: makeId(), ua, ja });
  saveSentences();
  addWordsFromSentence(ua);

  sentenceUaInput.value = '';
  sentenceJaInput.value = '';
  renderSentences();
  renderWords();
  updateDueCount();
});

// --- Words ---
function renderWords() {
  wordList.innerHTML = '';
  words.slice().reverse().forEach((word) => {
    const li = document.createElement('li');

    const uaSpan = document.createElement('span');
    uaSpan.className = 'word-ua';
    uaSpan.textContent = word.ua;

    const jaInput = document.createElement('input');
    jaInput.type = 'text';
    jaInput.placeholder = '日本語訳';
    jaInput.value = word.ja;
    jaInput.classList.toggle('empty-ja', !word.ja);
    jaInput.addEventListener('change', () => {
      word.ja = jaInput.value.trim();
      jaInput.classList.toggle('empty-ja', !word.ja);
      saveWords();
      updateDueCount();
    });

    const readingInput = document.createElement('input');
    readingInput.type = 'text';
    readingInput.placeholder = '読み';
    readingInput.value = word.reading;
    readingInput.addEventListener('change', () => {
      word.reading = readingInput.value.trim();
      saveWords();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => {
      words = words.filter((w) => w.id !== word.id);
      saveWords();
      renderWords();
      updateDueCount();
    });

    li.appendChild(uaSpan);
    li.appendChild(jaInput);
    li.appendChild(readingInput);
    li.appendChild(deleteBtn);
    wordList.appendChild(li);
  });
}

wordForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ua = wordUaInput.value.trim();
  const ja = wordJaInput.value.trim();
  const reading = wordReadingInput.value.trim();
  if (!ua) return;

  words.push({ id: makeId(), ua: ua.toLowerCase(), ja, reading, note: '', srs: defaultSrs() });
  saveWords();

  wordUaInput.value = '';
  wordJaInput.value = '';
  wordReadingInput.value = '';
  renderWords();
  updateDueCount();
});

// --- Tabs ---
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabContents.forEach((c) => c.classList.toggle('active', c.id === `${btn.dataset.tab}Tab`));
    if (btn.dataset.tab === 'study') {
      pickNextCard();
    }
  });
});

// --- Study / SRS ---
dirButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    direction = btn.dataset.dir;
    dirButtons.forEach((b) => b.classList.toggle('active', b === btn));
    pickNextCard();
  });
});

function dueWords() {
  const today = todayStr();
  return words.filter((w) => w.ua && w.ja && w.srs.dueDate <= today);
}

function updateDueCount() {
  dueCountEl.textContent = dueWords().length;
}

function pickNextCard() {
  const due = dueWords();
  isFlipped = false;
  flashcard.classList.remove('flipped');

  if (due.length === 0) {
    currentWord = null;
    flashcard.hidden = true;
    document.querySelector('.hint').hidden = true;
    ratingButtons.hidden = true;
    studyEmpty.hidden = false;
    return;
  }

  flashcard.hidden = false;
  document.querySelector('.hint').hidden = false;
  studyEmpty.hidden = true;
  ratingButtons.hidden = true;

  currentWord = due[Math.floor(Math.random() * due.length)];
  if (direction === 'ua-ja') {
    cardFront.textContent = currentWord.ua;
    cardBack.textContent = currentWord.ja;
  } else {
    cardFront.textContent = currentWord.ja;
    cardBack.textContent = currentWord.ua;
  }
}

flashcard.addEventListener('click', () => {
  if (!currentWord) return;
  isFlipped = !isFlipped;
  flashcard.classList.toggle('flipped', isFlipped);
  ratingButtons.hidden = !isFlipped;
});

ratingButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.rating-btn');
  if (!btn || !currentWord) return;

  applyRating(currentWord, btn.dataset.rating);
  saveWords();
  updateDueCount();
  pickNextCard();
});

function applyRating(word, rating) {
  const srs = word.srs;
  if (rating === 'again') {
    srs.interval = 0;
    srs.reps = 0;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
  } else {
    if (srs.reps === 0) {
      srs.interval = 1;
    } else if (rating === 'hard') {
      srs.interval = Math.max(1, Math.round(srs.interval * 1.2));
      srs.ease = Math.max(1.3, srs.ease - 0.15);
    } else if (rating === 'good') {
      srs.interval = Math.round(srs.interval * srs.ease);
    } else if (rating === 'easy') {
      srs.interval = Math.round(srs.interval * srs.ease * 1.3);
      srs.ease += 0.1;
    }
    srs.reps += 1;
  }
  srs.dueDate = addDays(todayStr(), srs.interval);
}

// --- Init ---
renderSentences();
renderWords();
updateDueCount();
