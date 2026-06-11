import {
  state, saveSentences, saveWords, saveSettings, makeId, todayStr,
  exportData, importData, bumpTodayLearned, bumpStreak,
} from './storage.js';
import { translateText, translateWords, detectLang } from './translate.js';
import {
  splitWords, findWord, addWord, removeWord, dueWords, applyRating,
  isCorrectAnswer, recordTestResult, comprehensionStats,
} from './words.js';
import { makeSpeakButton, speak, ttsSupported } from './tts.js';
import { generateExamples } from './examples.js';

// ========================= Tabs =========================
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabContents.forEach((c) => c.classList.toggle('active', c.id === `${btn.dataset.tab}Tab`));
    if (btn.dataset.tab === 'study') pickNextCard();
    if (btn.dataset.tab === 'words') renderWordList();
    if (btn.dataset.tab === 'settings') renderStats();
  });
});

// ========================= Word status / colors =========================
// green = registered, red = unregistered, orange = weak, blue = review due
function wordStatusInfo(ua) {
  const w = findWord(ua);
  if (!w || !w.ja) return { cls: 'st-unregistered', label: '未登録' };
  if (w.weak) return { cls: 'st-weak', label: '苦手' };
  if (w.srs.dueDate <= todayStr()) return { cls: 'st-due', label: '復習期限' };
  return { cls: 'st-registered', label: '登録済み' };
}

// ========================= Word tap panel =========================
const wordPanel = document.getElementById('wordPanel');
const wordPanelContent = document.getElementById('wordPanelContent');
document.getElementById('wordPanelClose').addEventListener('click', () => {
  wordPanel.hidden = true;
});

function openWordPanel(ua, ja, reading) {
  const existing = findWord(ua);
  wordPanelContent.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'word-panel-title';
  title.textContent = ua;
  wordPanelContent.appendChild(title);
  wordPanelContent.appendChild(makeSpeakButton(ua, 'uk-UA'));

  const transRow = document.createElement('div');
  transRow.textContent = `翻訳: ${ja || existing?.ja || '(未翻訳)'}`;
  wordPanelContent.appendChild(transRow);

  const readRow = document.createElement('div');
  readRow.textContent = `読み: ${reading || existing?.reading || '(未設定)'}`;
  wordPanelContent.appendChild(readRow);

  const exampleWord = existing || { ua, ja: ja || existing?.ja || '', examples: [] };
  const examples = generateExamples(exampleWord, 1);
  const exRow = document.createElement('div');
  exRow.className = 'word-panel-example';
  exRow.textContent = `例文: ${examples[0].ua} / ${examples[0].ja}`;
  wordPanelContent.appendChild(exRow);

  const statusRow = document.createElement('div');
  statusRow.className = 'word-panel-status';
  if (existing && existing.ja) {
    statusRow.textContent = '✅ 登録済み';
  } else {
    statusRow.textContent = '未登録';
    const addBtn = document.createElement('button');
    addBtn.textContent = '単語帳に追加';
    addBtn.addEventListener('click', () => {
      addWord({ ua, ja: ja || '', reading: reading || '' });
      wordPanel.hidden = true;
      renderSentenceWordTable(currentSentenceWords, currentSentenceTranslations);
    });
    statusRow.appendChild(addBtn);
  }
  wordPanelContent.appendChild(statusRow);

  wordPanel.hidden = false;
}

// ========================= 文章タブ =========================
const sentenceForm = document.getElementById('sentenceForm');
const sentenceInput = document.getElementById('sentenceInput');
const sentenceLang = document.getElementById('sentenceLang');
const sentenceResult = document.getElementById('sentenceResult');
const sentenceOriginal = document.getElementById('sentenceOriginal');
const sentenceTranslation = document.getElementById('sentenceTranslation');
const speakSentenceBtnHolder = document.getElementById('speakSentenceBtn');
const comprehensionEl = document.getElementById('comprehension');
const dedupeToggle = document.getElementById('dedupeToggle');
const wordTableBody = document.getElementById('wordTableBody');
const bulkAddBtn = document.getElementById('bulkAddBtn');
const saveSentenceBtn = document.getElementById('saveSentenceBtn');
const sentenceList = document.getElementById('sentenceList');

let currentSentenceWords = [];      // ua words from the current sentence
let currentSentenceTranslations = {}; // ua -> { ja, reading }
let currentSentenceUa = '';
let currentSentenceJa = '';
let currentSourceLang = 'uk';

sentenceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = sentenceInput.value.trim();
  if (!text) return;

  const langChoice = sentenceLang.value;
  const source = langChoice === 'auto' ? detectLang(text) : langChoice;
  const target = source === 'uk' ? 'ja' : 'uk';
  currentSourceLang = source;

  sentenceOriginal.textContent = text;
  sentenceTranslation.textContent = '翻訳中...';
  sentenceResult.hidden = false;
  speakSentenceBtnHolder.hidden = source !== 'uk' || !ttsSupported;

  const translated = await translateText(text, source, target);
  if (translated === null) {
    sentenceTranslation.textContent = '⚠ 翻訳に失敗しました（オフラインまたはAPI制限）。手動で確認してください。';
  } else {
    sentenceTranslation.textContent = translated;
  }

  if (source === 'uk') {
    currentSentenceUa = text;
    currentSentenceJa = translated || '';
  } else {
    currentSentenceUa = translated || '';
    currentSentenceJa = text;
  }

  // Word splitting only makes sense for Ukrainian text.
  const uaText = source === 'uk' ? text : (translated || '');
  currentSentenceWords = splitWords(uaText);
  currentSentenceTranslations = {};

  if (currentSentenceWords.length === 0) {
    wordTableBody.innerHTML = '<tr><td colspan="4">単語が見つかりませんでした</td></tr>';
    updateComprehension();
    return;
  }

  wordTableBody.innerHTML = '<tr><td colspan="4">単語を翻訳中...</td></tr>';

  // Use already-known translations where possible, only call API for the rest.
  const toTranslate = [];
  currentSentenceWords.forEach((ua) => {
    const known = findWord(ua);
    if (known && known.ja) {
      currentSentenceTranslations[ua] = { ja: known.ja, reading: known.reading };
    } else {
      toTranslate.push(ua);
    }
  });

  if (toTranslate.length > 0) {
    const translations = await translateWords(toTranslate, 'uk', 'ja');
    toTranslate.forEach((ua, i) => {
      currentSentenceTranslations[ua] = { ja: translations[i] || '', reading: '' };
    });
  }

  renderSentenceWordTable(currentSentenceWords, currentSentenceTranslations);
  updateComprehension();
});

function updateComprehension() {
  const stats = comprehensionStats(currentSentenceWords, { dedupe: dedupeToggle.checked });
  comprehensionEl.innerHTML = `
    総単語数: ${stats.total} /
    登録済み: ${stats.known} /
    未登録: ${stats.unknown} /
    苦手: ${stats.weak} /
    理解率: <strong>${stats.rate}%</strong>
  `;
}
dedupeToggle.addEventListener('change', updateComprehension);

function renderSentenceWordTable(uaWords, translations) {
  wordTableBody.innerHTML = '';
  uaWords.forEach((ua) => {
    const info = translations[ua] || { ja: '', reading: '' };
    const status = wordStatusInfo(ua);

    const tr = document.createElement('tr');
    tr.className = status.cls;

    const tdWord = document.createElement('td');
    tdWord.textContent = ua;
    tdWord.className = 'tap-word';
    tdWord.title = `タップして詳細表示 (${status.label})`;
    tdWord.addEventListener('click', () => openWordPanel(ua, info.ja, info.reading));

    const badge = document.createElement('span');
    badge.className = `status-dot ${status.cls}`;
    badge.title = status.label;
    tdWord.appendChild(badge);

    const tdJa = document.createElement('td');
    tdJa.textContent = info.ja || '-';

    const tdReading = document.createElement('td');
    tdReading.textContent = info.reading || '-';

    const tdAction = document.createElement('td');
    const existing = findWord(ua);
    if (existing && existing.ja) {
      tdAction.textContent = '✅';
    } else {
      const addBtn = document.createElement('button');
      addBtn.textContent = '追加';
      addBtn.addEventListener('click', () => {
        addWord({ ua, ja: info.ja, reading: info.reading });
        renderSentenceWordTable(uaWords, translations);
        updateComprehension();
      });
      tdAction.appendChild(addBtn);
    }

    tr.appendChild(tdWord);
    tr.appendChild(tdJa);
    tr.appendChild(tdReading);
    tr.appendChild(tdAction);
    wordTableBody.appendChild(tr);
  });
}

speakSentenceBtnHolder.addEventListener('click', () => {
  speak(currentSentenceUa, 'uk-UA');
});

bulkAddBtn.addEventListener('click', () => {
  currentSentenceWords.forEach((ua) => {
    const existing = findWord(ua);
    if (!existing || !existing.ja) {
      const info = currentSentenceTranslations[ua] || { ja: '', reading: '' };
      addWord({ ua, ja: info.ja, reading: info.reading });
    }
  });
  renderSentenceWordTable(currentSentenceWords, currentSentenceTranslations);
  updateComprehension();
});

saveSentenceBtn.addEventListener('click', () => {
  if (!currentSentenceUa) return;
  const stats = comprehensionStats(currentSentenceWords, { dedupe: dedupeToggle.checked });
  state.sentences.push({
    id: makeId(),
    ua: currentSentenceUa,
    ja: currentSentenceJa,
    words: currentSentenceWords,
    date: todayStr(),
    comprehension: stats.rate,
  });
  saveSentences();
  renderSentenceList();
});

function renderSentenceList() {
  sentenceList.innerHTML = '';
  state.sentences.slice().reverse().forEach((s) => {
    const li = document.createElement('li');

    const ua = document.createElement('div');
    ua.className = 'sentence-ua';
    ua.textContent = s.ua;

    const ja = document.createElement('div');
    ja.className = 'sentence-ja';
    ja.textContent = s.ja;

    const meta = document.createElement('div');
    meta.className = 'sentence-meta';
    meta.textContent = `登録日: ${s.date} / 理解率: ${s.comprehension}% / 単語数: ${s.words.length}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => {
      state.sentences = state.sentences.filter((x) => x.id !== s.id);
      saveSentences();
      renderSentenceList();
    });

    li.appendChild(ua);
    li.appendChild(ja);
    li.appendChild(meta);
    li.appendChild(deleteBtn);
    sentenceList.appendChild(li);
  });
}

// ========================= 単語一覧タブ =========================
const wordForm = document.getElementById('wordForm');
const wordUaInput = document.getElementById('wordUaInput');
const wordJaInput = document.getElementById('wordJaInput');
const wordReadingInput = document.getElementById('wordReadingInput');
const wordCategoryInput = document.getElementById('wordCategoryInput');
const wordList = document.getElementById('wordList');
const wordSearch = document.getElementById('wordSearch');
const categoryFilter = document.getElementById('categoryFilter');
const weakFilter = document.getElementById('weakFilter');
const dueCountEl = document.getElementById('dueCount');

wordForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ua = wordUaInput.value.trim();
  const ja = wordJaInput.value.trim();
  const reading = wordReadingInput.value.trim();
  const category = wordCategoryInput.value;
  if (!ua) return;

  addWord({ ua, ja, reading, category });

  wordUaInput.value = '';
  wordJaInput.value = '';
  wordReadingInput.value = '';
  renderWordList();
  updateDueCount();
});

[wordSearch, categoryFilter, weakFilter].forEach((el) => {
  el.addEventListener('input', renderWordList);
  el.addEventListener('change', renderWordList);
});

function renderWordList() {
  const query = wordSearch.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const weakOnly = weakFilter.checked;

  wordList.innerHTML = '';
  state.words.slice().reverse()
    .filter((w) => {
      if (weakOnly && !w.weak) return false;
      if (category === 'none' && w.category) return false;
      if (category !== '' && category !== 'none' && w.category !== category) return false;
      if (query && !(w.ua.includes(query) || (w.ja && w.ja.toLowerCase().includes(query)))) return false;
      return true;
    })
    .forEach((word) => {
      const li = document.createElement('li');
      const status = wordStatusInfo(word.ua);
      li.classList.add(status.cls);

      const dot = document.createElement('span');
      dot.className = `status-dot ${status.cls}`;
      dot.title = status.label;

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
        saveWordsAndRefresh();
      });

      const readingInput = document.createElement('input');
      readingInput.type = 'text';
      readingInput.placeholder = '読み';
      readingInput.value = word.reading;
      readingInput.addEventListener('change', () => {
        word.reading = readingInput.value.trim();
        saveWordsAndRefresh();
      });

      const catSelect = document.createElement('select');
      ['', 'A1', 'A2', 'B1', '日常会話', '旅行', 'ニュース', '学校'].forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c || '(なし)';
        if (word.category === c) opt.selected = true;
        catSelect.appendChild(opt);
      });
      catSelect.addEventListener('change', () => {
        word.category = catSelect.value;
        saveWordsAndRefresh();
      });

      const speakBtn = makeSpeakButton(word.ua, 'uk-UA');

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = '削除';
      deleteBtn.addEventListener('click', () => {
        removeWord(word.id);
        renderWordList();
        updateDueCount();
      });

      li.appendChild(dot);
      li.appendChild(uaSpan);
      li.appendChild(speakBtn);
      li.appendChild(jaInput);
      li.appendChild(readingInput);
      li.appendChild(catSelect);
      li.appendChild(deleteBtn);
      wordList.appendChild(li);
    });
}

function saveWordsAndRefresh() {
  saveWords();
  updateDueCount();
}

function updateDueCount() {
  dueCountEl.textContent = dueWords().length;
}

// ========================= 学習タブ (SRS) =========================
const dirButtons = document.querySelectorAll('.dir-btn');
const flashcard = document.getElementById('flashcard');
const cardFront = document.getElementById('cardFront');
const cardBack = document.getElementById('cardBack');
const studyEmpty = document.getElementById('studyEmpty');
const ratingButtons = document.getElementById('ratingButtons');
const studyHint = document.querySelector('#studyTab .hint');

let direction = 'ua-ja';
let currentWord = null;
let isFlipped = false;

dirButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    direction = btn.dataset.dir;
    dirButtons.forEach((b) => b.classList.toggle('active', b === btn));
    pickNextCard();
  });
});

function pickNextCard() {
  const due = dueWords();
  isFlipped = false;
  flashcard.classList.remove('flipped');

  if (due.length === 0) {
    currentWord = null;
    flashcard.hidden = true;
    studyHint.hidden = true;
    ratingButtons.hidden = true;
    studyEmpty.hidden = false;
    return;
  }

  flashcard.hidden = false;
  studyHint.hidden = false;
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
  if (btn.dataset.rating === 'good' || btn.dataset.rating === 'easy') {
    bumpTodayLearned(1);
  }
  bumpStreak();
  updateDueCount();
  pickNextCard();
});

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
  let pool = state.words.filter((w) => w.ua && w.ja);
  if (testScope.value === 'weak') pool = pool.filter((w) => w.weak);
  if (pool.length === 0) {
    alert('対象となる単語がありません。');
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

  const word = testQueue[testIndex];
  testQuestionDir = currentDirection();
  testProgress.textContent = `第 ${testIndex + 1} / ${testQueue.length} 問`;

  const prompt = testQuestionDir === 'ua-ja' ? word.ua : word.ja;
  const answer = testQuestionDir === 'ua-ja' ? word.ja : word.ua;
  testQuestion.textContent = prompt;

  if (testMode.value === 'input') {
    testInputForm.hidden = false;
    testInputForm.dataset.answer = answer;
    testAnswerInput.focus();
  } else if (testMode.value === 'choice') {
    testChoices.hidden = false;
    testChoices.innerHTML = '';
    const others = shuffle(state.words.filter((w) => w.id !== word.id))
      .slice(0, 3)
      .map((w) => (testQuestionDir === 'ua-ja' ? w.ja : w.ua))
      .filter(Boolean);
    const choices = shuffle([answer, ...others]);
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => gradeAnswer(word, choice === answer, choice, answer));
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
  const word = testQueue[testIndex];
  const answer = testInputForm.dataset.answer;
  const userAnswer = testAnswerInput.value.trim();
  gradeAnswer(word, isCorrectAnswer(userAnswer, answer), userAnswer, answer);
});

testCardButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.rating-btn');
  if (!btn) return;
  const word = testQueue[testIndex];
  const correct = btn.dataset.correct === 'true';
  gradeAnswer(word, correct, null, null);
});

function gradeAnswer(word, correct, userAnswer, expected) {
  recordTestResult(word, correct);
  if (correct) testCorrectCount += 1;

  testInputForm.hidden = true;
  testChoices.hidden = true;
  testCardButtons.hidden = true;

  testFeedback.hidden = false;
  testFeedback.className = `test-feedback ${correct ? 'correct' : 'incorrect'}`;
  if (expected !== null) {
    testFeedback.textContent = correct
      ? '✅ 正解！'
      : `❌ 不正解。正解: ${expected}（あなたの回答: ${userAnswer || '(空欄)'}）`;
  } else {
    testFeedback.textContent = correct ? '✅ 正解！' : '❌ 不正解。苦手単語に登録しました。';
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
    <h3>結果</h3>
    <p>正解数: ${testCorrectCount} / ${total}（正答率 ${rate}%）</p>
    <button id="restartTestBtn">もう一度テストを設定する</button>
  `;
  document.getElementById('restartTestBtn').addEventListener('click', () => {
    testResult.hidden = true;
    testSetup.hidden = false;
  });
  bumpStreak();
}

// ========================= 設定タブ =========================
const statsList = document.getElementById('statsList');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');

function renderStats() {
  const total = state.words.length;
  const today = todayStr();
  const todayAdded = state.settings.todayAdded.date === today ? state.settings.todayAdded.count : 0;
  const todayLearned = state.settings.todayLearned.date === today ? state.settings.todayLearned.count : 0;
  const due = dueWords().length;
  const weak = state.words.filter((w) => w.weak).length;
  const totalCorrect = state.words.reduce((s, w) => s + w.stats.correct, 0);
  const totalIncorrect = state.words.reduce((s, w) => s + w.stats.incorrect, 0);
  const accuracy = (totalCorrect + totalIncorrect) === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100);

  const items = [
    ['総単語数', total],
    ['今日追加した単語数', todayAdded],
    ['今日覚えた単語数', todayLearned],
    ['復習待ち単語数', due],
    ['苦手単語数', weak],
    ['正答率', `${accuracy}%`],
    ['連続学習日数', `${state.settings.streak} 日`],
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
    renderWordList();
    renderSentenceList();
    updateDueCount();
    renderStats();
    alert('インポートが完了しました。');
  } catch (err) {
    alert('インポートに失敗しました: ' + err.message);
  }
  importFile.value = '';
});

// ========================= Init =========================
renderSentenceList();
renderWordList();
updateDueCount();
renderStats();
