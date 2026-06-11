import {
  state, saveItems, saveSettings, exportData, importData, todayStr,
  bumpTodayLearned, bumpStreak,
} from './storage.js';
import {
  extractFromSentence, addVocabItem, addSentence, removeItem,
  dueWords, applyRating, isCorrectAnswer,
  recordTestResult, vocabItems, sentenceItems,
} from './words.js';
import { makeSpeakButton } from './tts.js';
import { t, setLang, getLang, applyStaticTranslations, CATEGORIES, normalizeCategory } from './i18n.js';

// ========================= Tabs =========================
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabContents.forEach((c) => c.classList.toggle('active', c.id === `${btn.dataset.tab}Tab`));
    if (btn.dataset.tab === 'vocab') renderVocabList();
    if (btn.dataset.tab === 'home') renderRecentSentences();
  });
});

// ========================= 設定モーダル =========================
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const statsList = document.getElementById('statsList');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const languageSelect = document.getElementById('languageSelect');

setLang(state.settings.lang || 'ja');
languageSelect.value = getLang();
applyStaticTranslations();

languageSelect.addEventListener('change', () => {
  state.settings.lang = languageSelect.value;
  saveSettings();
  setLang(state.settings.lang);
  applyStaticTranslations();
  renderStats();
  refreshAll();
});

function openSettings() {
  console.log('[settings] open() called');
  renderStats();
  settingsModal.hidden = false;
  console.log('[settings] after open, hidden =', settingsModal.hidden, 'in DOM:', document.body.contains(settingsModal));
}

function closeSettings() {
  console.log('[settings] close() called');
  settingsModal.hidden = true;
  console.log('[settings] after close, hidden =', settingsModal.hidden,
    'computed display =', getComputedStyle(settingsModal).display);
}

console.log('[settings] settingsBtn:', settingsBtn, 'closeSettingsBtn:', closeSettingsBtn, 'settingsModal:', settingsModal);

settingsBtn.addEventListener('click', () => { console.log('[settings] settingsBtn click'); openSettings(); });
closeSettingsBtn.addEventListener('click', (e) => {
  console.log('[settings] closeSettingsBtn click', e.target);
  e.preventDefault();
  e.stopPropagation();
  closeSettings();
});
settingsModal.addEventListener('click', (e) => {
  console.log('[settings] modal backdrop click, target =', e.target, 'is modal itself:', e.target === settingsModal);
  if (e.target === settingsModal) closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
});

// Swipe-down to close (touch devices, e.g. iPhone Safari).
let touchStartY = null;
const modalContent = settingsModal.querySelector('.modal-content');
modalContent.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
modalContent.addEventListener('touchend', (e) => {
  if (touchStartY === null) return;
  const deltaY = e.changedTouches[0].clientY - touchStartY;
  touchStartY = null;
  if (deltaY > 80) closeSettings();
});

function renderStats() {
  const vocab = vocabItems();
  const total = vocab.length;
  const weak = vocab.filter((it) => it.weak).length;
  const due = dueWords().length;
  const totalCorrect = vocab.reduce((s, it) => s + it.stats.correct, 0);
  const totalIncorrect = vocab.reduce((s, it) => s + it.stats.incorrect, 0);
  const accuracy = (totalCorrect + totalIncorrect) === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100);

  const items = [
    [t('statTotalWords'), total],
    [t('statWeak'), weak],
    [t('statDue'), due],
    [t('statAccuracy'), `${accuracy}%`],
    [t('statStreak'), `${state.settings.streak} ${t('streakUnit')}`],
  ];

  statsList.innerHTML = '';
  items.forEach(([label, value]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    statsList.appendChild(li);
  });
}

exportBtn.addEventListener('click', () => {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vocab-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    importData(text);
    refreshAll();
    alert(t('importSuccess'));
  } catch (err) {
    alert(t('importFailPrefix') + err.message);
  }
  importFile.value = '';
});

// ========================= ホーム: 文章フォーム =========================
const dueCountEl = document.getElementById('dueCount');
const newSentenceBtn = document.getElementById('newSentenceBtn');
const sentenceForm = document.getElementById('sentenceForm');
const sourceInput = document.getElementById('sourceInput');
const targetInput = document.getElementById('targetInput');
const categoryInput = document.getElementById('categoryInput');
const extractBtn = document.getElementById('extractBtn');
const cancelSentenceBtn = document.getElementById('cancelSentenceBtn');
const extractResult = document.getElementById('extractResult');
const wordChips = document.getElementById('wordChips');
const saveSentenceBtn = document.getElementById('saveSentenceBtn');
const recentSentences = document.getElementById('recentSentences');

let pendingWords = []; // [source, ...]

newSentenceBtn.addEventListener('click', () => {
  resetSentenceForm();
  sentenceForm.hidden = !sentenceForm.hidden;
});

cancelSentenceBtn.addEventListener('click', () => {
  sentenceForm.hidden = true;
  resetSentenceForm();
});

function resetSentenceForm() {
  sourceInput.value = '';
  targetInput.value = '';
  categoryInput.selectedIndex = 0;
  extractResult.hidden = true;
  pendingWords = [];
}

extractBtn.addEventListener('click', () => {
  const text = sourceInput.value.trim();
  if (!text) {
    alert(t('emptySourceAlert'));
    return;
  }
  const { words } = extractFromSentence(text);
  pendingWords = [...words];
  extractResult.hidden = false;
  renderChips();
});

function renderChips() {
  wordChips.innerHTML = '';
  pendingWords.forEach((source, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip chip-word';
    chip.textContent = source;
    chip.title = t('extractHint');
    chip.addEventListener('click', () => {
      pendingWords.splice(idx, 1);
      renderChips();
    });
    wordChips.appendChild(chip);
  });
  if (pendingWords.length === 0) {
    wordChips.innerHTML = `<span class="hint">${t('noCategory')}</span>`;
  }
}

saveSentenceBtn.addEventListener('click', () => {
  const source = sourceInput.value.trim();
  if (!source) return;
  const target = targetInput.value.trim();
  const category = categoryInput.value.trim();
  const words = [...pendingWords];

  words.forEach((w) => addVocabItem({ source: w, category, type: 'word' }));
  addSentence({ source, target, category, words });

  saveItems();
  sentenceForm.hidden = true;
  resetSentenceForm();
  refreshAll();
});

function renderRecentSentences() {
  recentSentences.innerHTML = '';
  sentenceItems().slice().reverse().slice(0, 10).forEach((s) => {
    const li = document.createElement('li');
    li.className = 'sentence-item';

    const src = document.createElement('div');
    src.className = 'sentence-ua';
    src.textContent = s.source;

    const tgt = document.createElement('div');
    tgt.className = 'sentence-ja';
    tgt.textContent = s.target || t('noTranslation');

    const meta = document.createElement('div');
    meta.className = 'sentence-meta';
    const wordCount = (s.words || []).length;
    meta.textContent = t('sentenceMeta', { date: s.date, category: s.category || t('noCategory'), rate: s.comprehension, count: wordCount });

    const actions = document.createElement('div');
    actions.className = 'sentence-actions';

    const speakBtn = makeSpeakButton(s.source, 'uk-UA');

    const editBtn = document.createElement('button');
    editBtn.textContent = t('editBtn');
    editBtn.className = 'small-btn';
    editBtn.addEventListener('click', () => openSentenceEditor(li, s));

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = t('deleteTitle');
    delBtn.addEventListener('click', () => {
      removeItem(s.id);
      refreshAll();
    });

    actions.appendChild(speakBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(src);
    li.appendChild(tgt);
    li.appendChild(meta);
    li.appendChild(actions);
    recentSentences.appendChild(li);
  });

  if (sentenceItems().length === 0) {
    recentSentences.innerHTML = `<li class="hint">${t('emptySentences')}</li>`;
  }
}

function openSentenceEditor(li, s) {
  li.innerHTML = '';

  const srcInput = document.createElement('textarea');
  srcInput.value = s.source;
  srcInput.rows = 2;

  const tgtInput = document.createElement('textarea');
  tgtInput.value = s.target;
  tgtInput.rows = 2;

  const catInput = document.createElement('select');
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = t(`cat${c[0].toUpperCase()}${c.slice(1)}`);
    catInput.appendChild(opt);
  });
  catInput.value = s.category || CATEGORIES[0];

  const actions = document.createElement('div');
  actions.className = 'sentence-actions';

  const reExtractBtn = document.createElement('button');
  reExtractBtn.className = 'small-btn';
  reExtractBtn.textContent = t('reExtractBtn');
  reExtractBtn.addEventListener('click', () => {
    const { words } = extractFromSentence(srcInput.value.trim());
    s.words = words;
    words.forEach((w) => addVocabItem({ source: w, category: catInput.value.trim(), type: 'word' }));
    saveItems();
    alert(t('reExtractDone'));
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'small-btn primary-btn';
  saveBtn.textContent = t('saveBtn');
  saveBtn.addEventListener('click', () => {
    s.source = srcInput.value.trim();
    s.target = tgtInput.value.trim();
    s.category = normalizeCategory(catInput.value.trim());
    saveItems();
    refreshAll();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'small-btn ghost-btn';
  cancelBtn.textContent = t('cancelBtn');
  cancelBtn.addEventListener('click', () => renderRecentSentences());

  actions.appendChild(reExtractBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  li.appendChild(srcInput);
  li.appendChild(tgtInput);
  li.appendChild(catInput);
  li.appendChild(actions);
}

function updateDueCount() {
  dueCountEl.textContent = dueWords().length;
}

// ========================= 単語帳タブ =========================
const vocabSearch = document.getElementById('vocabSearch');
const weakFilter = document.getElementById('weakFilter');
const vocabList = document.getElementById('vocabList');

[vocabSearch, weakFilter].forEach((el) => {
  el.addEventListener('input', renderVocabList);
  el.addEventListener('change', renderVocabList);
});

function renderVocabList() {
  const query = vocabSearch.value.trim().toLowerCase();
  const weakOnly = weakFilter.checked;

  vocabList.innerHTML = '';
  vocabItems().slice().reverse()
    .filter((it) => {
      if (weakOnly && !it.weak) return false;
      if (query && !(it.source.includes(query) || (it.target && it.target.toLowerCase().includes(query)))) return false;
      return true;
    })
    .forEach((item) => vocabList.appendChild(renderVocabRow(item)));

  if (vocabList.children.length === 0) {
    vocabList.innerHTML = `<li class="hint">${t('emptyVocab')}</li>`;
  }
}

function renderVocabRow(item) {
  const li = document.createElement('li');
  li.className = 'vocab-item';
  if (item.weak) li.classList.add('st-weak');

  const sourceInputEl = document.createElement('input');
  sourceInputEl.type = 'text';
  sourceInputEl.className = 'vocab-source';
  sourceInputEl.value = item.source;
  sourceInputEl.addEventListener('change', () => {
    item.source = sourceInputEl.value.trim().toLowerCase();
    saveItems();
  });

  const targetInputEl = document.createElement('input');
  targetInputEl.type = 'text';
  targetInputEl.placeholder = t('meaningPlaceholder');
  targetInputEl.className = 'vocab-target';
  targetInputEl.classList.toggle('empty-ja', !item.target);
  targetInputEl.value = item.target;
  targetInputEl.addEventListener('change', () => {
    item.target = targetInputEl.value.trim();
    item.reviewFlag = false;
    targetInputEl.classList.toggle('empty-ja', !item.target);
    saveItems();
    updateDueCount();
  });

  const speakBtn = makeSpeakButton(item.source, 'uk-UA');

  const weakBtn = document.createElement('button');
  weakBtn.className = `review-btn${item.weak ? ' active' : ''}`;
  weakBtn.textContent = item.weak ? t('weakBtnOn') : t('weakBtnOff');
  weakBtn.title = t('weakBtnOff');
  weakBtn.addEventListener('click', () => {
    item.weak = !item.weak;
    saveItems();
    renderVocabList();
  });

  const statsEl = document.createElement('span');
  statsEl.className = 'vocab-stats';
  statsEl.textContent = t('vocabStats', { correct: item.stats.correct, incorrect: item.stats.incorrect });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = '削除';
  deleteBtn.addEventListener('click', () => {
    removeItem(item.id);
    refreshAll();
  });

  const row1 = document.createElement('div');
  row1.className = 'vocab-row';
  row1.appendChild(sourceInputEl);
  row1.appendChild(speakBtn);
  row1.appendChild(deleteBtn);

  const row2 = document.createElement('div');
  row2.className = 'vocab-row';
  row2.appendChild(targetInputEl);

  const row3 = document.createElement('div');
  row3.className = 'vocab-row';
  row3.appendChild(weakBtn);
  row3.appendChild(statsEl);

  li.appendChild(row1);
  li.appendChild(row2);
  li.appendChild(row3);
  return li;
}

// ========================= テストタブ =========================
const testSetup = document.getElementById('testSetup');
const testDirection = document.getElementById('testDirection');
const testMode = document.getElementById('testMode');
const testScope = document.getElementById('testScope');
const startTestBtn = document.getElementById('startTestBtn');
const testArea = document.getElementById('testArea');
const testProgress = document.getElementById('testProgress');
const testQuestion = document.getElementById('testQuestion');
const testInputForm = document.getElementById('testInputForm');
const testAnswerInput = document.getElementById('testAnswerInput');
const testChoices = document.getElementById('testChoices');
const testCard = document.getElementById('testCard');
const testCardInner = document.getElementById('testCardInner');
const testCardFront = document.getElementById('testCardFront');
const testCardBack = document.getElementById('testCardBack');
const testCardButtons = document.getElementById('testCardButtons');
const testFeedback = document.getElementById('testFeedback');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const testResult = document.getElementById('testResult');

let testQueue = [];
let testIndex = 0;
let testCorrectCount = 0;
let testQuestionDir = 'ua-ja';

startTestBtn.addEventListener('click', () => {
  let pool = vocabItems().filter((it) => it.source && it.target);
  if (testScope.value === 'weak') pool = pool.filter((it) => it.weak);
  if (testScope.value === 'due') pool = pool.filter((it) => it.srs.dueDate <= todayStr());
  if (pool.length === 0) {
    alert(t('noTestItemsAlert'));
    return;
  }
  testQueue = shuffle(pool).slice(0, Math.min(pool.length, 20));
  testIndex = 0;
  testCorrectCount = 0;
  testSetup.hidden = true;
  testResult.hidden = true;
  testArea.hidden = false;
  showTestQuestion();
});

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentDirection() {
  if (testDirection.value === 'random') return Math.random() < 0.5 ? 'ua-ja' : 'ja-ua';
  return testDirection.value;
}

function showTestQuestion() {
  testFeedback.hidden = true;
  nextQuestionBtn.hidden = true;
  testInputForm.hidden = true;
  testChoices.hidden = true;
  testCard.hidden = true;
  testCardButtons.hidden = true;
  testAnswerInput.value = '';
  testCardInner.classList.remove('flipped');

  if (testIndex >= testQueue.length) {
    finishTest();
    return;
  }

  const item = testQueue[testIndex];
  testQuestionDir = currentDirection();
  testProgress.textContent = t('progressLabel', { current: testIndex + 1, total: testQueue.length });

  const prompt = testQuestionDir === 'ua-ja' ? item.source : item.target;
  const answer = testQuestionDir === 'ua-ja' ? item.target : item.source;
  testQuestion.textContent = prompt;

  if (testMode.value === 'input') {
    testInputForm.hidden = false;
    testInputForm.dataset.answer = answer;
    testAnswerInput.focus();
  } else if (testMode.value === 'choice') {
    testChoices.hidden = false;
    testChoices.innerHTML = '';
    const others = shuffle(vocabItems().filter((w) => w.id !== item.id && w.target))
      .slice(0, 3)
      .map((w) => (testQuestionDir === 'ua-ja' ? w.target : w.source))
      .filter(Boolean);
    const choices = shuffle([answer, ...others]);
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => gradeAnswer(item, choice === answer, choice, answer));
      testChoices.appendChild(btn);
    });
  } else { // card
    testCard.hidden = false;
    testCardFront.textContent = prompt;
    testCardBack.textContent = answer;
    testCardButtons.hidden = false;
  }
}

testCard.addEventListener('click', () => {
  testCardInner.classList.toggle('flipped');
});

testInputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const item = testQueue[testIndex];
  const answer = testInputForm.dataset.answer;
  const userAnswer = testAnswerInput.value.trim();
  gradeAnswer(item, isCorrectAnswer(userAnswer, answer), userAnswer, answer);
});

testCardButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.rating-btn');
  if (!btn) return;
  const item = testQueue[testIndex];
  const rating = btn.dataset.rating;
  const correct = rating !== 'again';
  gradeAnswer(item, correct, null, null, rating);
});

function gradeAnswer(item, correct, userAnswer, expected, rating) {
  recordTestResult(item, correct);
  applyRating(item, rating || (correct ? 'good' : 'again'));
  if (correct) {
    testCorrectCount += 1;
    bumpTodayLearned(1);
  }

  testInputForm.hidden = true;
  testChoices.hidden = true;
  testCardButtons.hidden = true;

  testFeedback.hidden = false;
  testFeedback.className = `test-feedback ${correct ? 'correct' : 'incorrect'}`;
  if (expected !== null) {
    testFeedback.textContent = correct
      ? t('feedbackCorrect')
      : t('feedbackIncorrect', { expected, answer: userAnswer || t('feedbackEmptyAnswer') });
  } else {
    testFeedback.textContent = correct ? t('feedbackCorrect') : t('feedbackIncorrectNoExpected');
  }

  nextQuestionBtn.hidden = false;
  updateDueCount();
}

nextQuestionBtn.addEventListener('click', () => {
  testIndex += 1;
  showTestQuestion();
});

function finishTest() {
  testArea.hidden = true;
  testResult.hidden = false;
  const total = testQueue.length;
  const rate = total === 0 ? 0 : Math.round((testCorrectCount / total) * 100);
  testResult.innerHTML = `
    <h3>${t('resultHeading')}</h3>
    <p>${t('resultLine', { correct: testCorrectCount, total, rate })}</p>
    <button id="restartTestBtn">${t('restartBtn')}</button>
  `;
  document.getElementById('restartTestBtn').addEventListener('click', () => {
    testResult.hidden = true;
    testSetup.hidden = false;
  });
  bumpStreak();
}

// ========================= Init =========================
function refreshAll() {
  renderRecentSentences();
  renderVocabList();
  updateDueCount();
}

refreshAll();
