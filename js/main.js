import {
  state, saveItems, exportData, importData, todayStr,
  bumpTodayLearned, bumpStreak, itemStatus,
} from './storage.js';
import {
  extractFromSentence, addVocabItem, addSentence, removeItem, setItemType,
  mergeItems, splitItem, dueWords, applyRating, isCorrectAnswer,
  recordTestResult, vocabItems, sentenceItems, findVocabItem,
} from './words.js';
import { makeSpeakButton, ttsSupported } from './tts.js';

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

// ========================= Category list =========================
const categoryList = document.getElementById('categoryList');
function refreshCategoryList() {
  const cats = new Set();
  state.items.forEach((it) => { if (it.category) cats.add(it.category); });
  categoryList.innerHTML = '';
  [...cats].sort().forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    categoryList.appendChild(opt);
  });
}

// ========================= 設定モーダル =========================
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const statsList = document.getElementById('statsList');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');

function openSettings() {
  renderStats();
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
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
  const totalWords = vocab.filter((it) => it.type === 'word').length;
  const totalPhrases = vocab.filter((it) => it.type === 'phrase').length;
  const weak = vocab.filter((it) => it.weak).length;
  const due = dueWords().length;
  const totalCorrect = vocab.reduce((s, it) => s + it.stats.correct, 0);
  const totalIncorrect = vocab.reduce((s, it) => s + it.stats.incorrect, 0);
  const accuracy = (totalCorrect + totalIncorrect) === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100);

  const items = [
    ['総単語数', totalWords],
    ['総フレーズ数', totalPhrases],
    ['苦手単語数', weak],
    ['復習待ち件数', due],
    ['正答率', `${accuracy}%`],
    ['連続学習日数', `${state.settings.streak} 日`],
    ['登録項目合計', total],
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
    alert('インポートが完了しました。');
  } catch (err) {
    alert('インポートに失敗しました: ' + err.message);
  }
  importFile.value = '';
});

// ========================= 単語タップ用パネル =========================
const wordPanel = document.getElementById('wordPanel');
const wordPanelContent = document.getElementById('wordPanelContent');
document.getElementById('wordPanelClose').addEventListener('click', () => {
  wordPanel.hidden = true;
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
const phraseChips = document.getElementById('phraseChips');
const wordChips = document.getElementById('wordChips');
const phraseifyBtn = document.getElementById('phraseifyBtn');
const saveSentenceBtn = document.getElementById('saveSentenceBtn');
const recentSentences = document.getElementById('recentSentences');

let pendingWords = []; // [{ source, selected }]
let pendingPhrases = []; // [source, ...]

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
  categoryInput.value = '';
  extractResult.hidden = true;
  pendingWords = [];
  pendingPhrases = [];
}

extractBtn.addEventListener('click', () => {
  const text = sourceInput.value.trim();
  if (!text) {
    alert('原文を入力してください。');
    return;
  }
  const { words, phrases } = extractFromSentence(text);
  pendingWords = words.map((source) => ({ source, selected: false }));
  pendingPhrases = [...phrases];
  extractResult.hidden = false;
  renderChips();
});

function renderChips() {
  phraseChips.innerHTML = '';
  pendingPhrases.forEach((source, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip chip-phrase';
    chip.textContent = source;
    chip.title = 'タップで削除';
    chip.addEventListener('click', () => {
      pendingPhrases.splice(idx, 1);
      renderChips();
    });
    phraseChips.appendChild(chip);
  });
  if (pendingPhrases.length === 0) {
    phraseChips.innerHTML = '<span class="hint">なし</span>';
  }

  wordChips.innerHTML = '';
  pendingWords.forEach((w, idx) => {
    const chip = document.createElement('span');
    chip.className = `chip chip-word${w.selected ? ' selected' : ''}`;
    chip.textContent = w.source;
    chip.title = 'タップで選択 / 長押しで削除';
    chip.addEventListener('click', () => {
      w.selected = !w.selected;
      renderChips();
    });
    chip.addEventListener('dblclick', () => {
      pendingWords.splice(idx, 1);
      renderChips();
    });
    wordChips.appendChild(chip);
  });
  if (pendingWords.length === 0) {
    wordChips.innerHTML = '<span class="hint">なし</span>';
  }
}

phraseifyBtn.addEventListener('click', () => {
  const selected = pendingWords.filter((w) => w.selected);
  if (selected.length < 2) {
    alert('2つ以上の単語を選択してください。');
    return;
  }
  const phrase = selected.map((w) => w.source).join(' ');
  pendingWords = pendingWords.filter((w) => !w.selected);
  pendingPhrases.push(phrase);
  renderChips();
});

saveSentenceBtn.addEventListener('click', () => {
  const source = sourceInput.value.trim();
  if (!source) return;
  const target = targetInput.value.trim();
  const category = categoryInput.value.trim();
  const words = pendingWords.map((w) => w.source);
  const phrases = [...pendingPhrases];

  words.forEach((w) => addVocabItem({ source: w, category, type: 'word' }));
  phrases.forEach((p) => addVocabItem({ source: p, category, type: 'phrase' }));
  addSentence({ source, target, category, words, phrases });

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
    tgt.textContent = s.target || '(翻訳未入力)';

    const meta = document.createElement('div');
    meta.className = 'sentence-meta';
    const wordCount = (s.words || []).length + (s.phrases || []).length;
    meta.textContent = `登録日: ${s.date} / カテゴリ: ${s.category || 'なし'} / 理解率: ${s.comprehension}% / 項目数: ${wordCount}`;

    const actions = document.createElement('div');
    actions.className = 'sentence-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '編集';
    editBtn.className = 'small-btn';
    editBtn.addEventListener('click', () => openSentenceEditor(li, s));

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = '削除';
    delBtn.addEventListener('click', () => {
      removeItem(s.id);
      refreshAll();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(src);
    li.appendChild(tgt);
    li.appendChild(meta);
    li.appendChild(actions);
    recentSentences.appendChild(li);
  });

  if (sentenceItems().length === 0) {
    recentSentences.innerHTML = '<li class="hint">まだ文章が登録されていません。「＋ 新しい文章を追加」から始めましょう。</li>';
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

  const catInput = document.createElement('input');
  catInput.type = 'text';
  catInput.value = s.category || '';
  catInput.placeholder = 'カテゴリ';

  const actions = document.createElement('div');
  actions.className = 'sentence-actions';

  const reExtractBtn = document.createElement('button');
  reExtractBtn.className = 'small-btn';
  reExtractBtn.textContent = '再抽出';
  reExtractBtn.addEventListener('click', () => {
    const { words, phrases } = extractFromSentence(srcInput.value.trim());
    s.words = words;
    s.phrases = phrases;
    words.forEach((w) => addVocabItem({ source: w, category: catInput.value.trim(), type: 'word' }));
    phrases.forEach((p) => addVocabItem({ source: p, category: catInput.value.trim(), type: 'phrase' }));
    saveItems();
    alert('単語・フレーズを再抽出しました。');
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'small-btn primary-btn';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => {
    s.source = srcInput.value.trim();
    s.target = tgtInput.value.trim();
    s.category = catInput.value.trim();
    saveItems();
    refreshAll();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'small-btn ghost-btn';
  cancelBtn.textContent = 'キャンセル';
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
const categoryFilter = document.getElementById('categoryFilter');
const typeFilter = document.getElementById('typeFilter');
const untranslatedFilter = document.getElementById('untranslatedFilter');
const weakFilter = document.getElementById('weakFilter');
const mergeBtn = document.getElementById('mergeBtn');
const vocabList = document.getElementById('vocabList');

let selectedForMerge = new Set();

[vocabSearch, categoryFilter, typeFilter].forEach((el) => {
  el.addEventListener('input', renderVocabList);
  el.addEventListener('change', renderVocabList);
});
[untranslatedFilter, weakFilter].forEach((el) => {
  el.addEventListener('change', renderVocabList);
});

mergeBtn.addEventListener('click', () => {
  if (selectedForMerge.size < 2) {
    alert('結合するには2つ以上選択してください。');
    return;
  }
  mergeItems([...selectedForMerge]);
  selectedForMerge = new Set();
  refreshAll();
});

function renderVocabList() {
  const query = vocabSearch.value.trim().toLowerCase();
  const category = categoryFilter.value.trim().toLowerCase();
  const type = typeFilter.value;
  const untranslatedOnly = untranslatedFilter.checked;
  const weakOnly = weakFilter.checked;

  vocabList.innerHTML = '';
  vocabItems().slice().reverse()
    .filter((it) => {
      if (type && it.type !== type) return false;
      if (weakOnly && !it.weak) return false;
      if (untranslatedOnly && itemStatus(it) === 'translated') return false;
      if (category && (it.category || '').toLowerCase() !== category) return false;
      if (query && !(it.source.includes(query) || (it.target && it.target.toLowerCase().includes(query)))) return false;
      return true;
    })
    .forEach((item) => vocabList.appendChild(renderVocabRow(item)));

  if (vocabList.children.length === 0) {
    vocabList.innerHTML = '<li class="hint">該当する項目がありません。</li>';
  }
}

function renderVocabRow(item) {
  const li = document.createElement('li');
  li.className = 'vocab-item';

  const status = itemStatus(item);
  const today = todayStr();
  if (item.weak) li.classList.add('st-weak');
  else if (status === 'untranslated') li.classList.add('st-unregistered');
  else if (item.srs.dueDate <= today) li.classList.add('st-due');
  else li.classList.add('st-registered');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedForMerge.has(item.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedForMerge.add(item.id);
    else selectedForMerge.delete(item.id);
  });

  const typeBtn = document.createElement('button');
  typeBtn.className = 'type-btn';
  typeBtn.textContent = item.type === 'phrase' ? 'フレーズ' : '単語';
  typeBtn.title = 'タップで単語/フレーズを切り替え';
  typeBtn.addEventListener('click', () => {
    setItemType(item.id, item.type === 'phrase' ? 'word' : 'phrase');
    renderVocabList();
  });

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
  targetInputEl.placeholder = '翻訳（未入力）';
  targetInputEl.className = 'vocab-target';
  targetInputEl.classList.toggle('empty-ja', !item.target);
  targetInputEl.value = item.target;
  targetInputEl.addEventListener('change', () => {
    item.target = targetInputEl.value.trim();
    item.reviewFlag = false;
    targetInputEl.classList.toggle('empty-ja', !item.target);
    saveItems();
    refreshDueAndStats();
  });

  const catInputEl = document.createElement('input');
  catInputEl.type = 'text';
  catInputEl.className = 'vocab-category';
  catInputEl.placeholder = 'カテゴリ';
  catInputEl.value = item.category || '';
  catInputEl.setAttribute('list', 'categoryList');
  catInputEl.addEventListener('change', () => {
    item.category = catInputEl.value.trim();
    saveItems();
    refreshCategoryList();
  });

  const reviewBtn = document.createElement('button');
  reviewBtn.className = `review-btn${item.reviewFlag ? ' active' : ''}`;
  reviewBtn.textContent = '要確認';
  reviewBtn.title = '要確認フラグを切り替え';
  reviewBtn.addEventListener('click', () => {
    item.reviewFlag = !item.reviewFlag;
    saveItems();
    renderVocabList();
  });

  const speakBtn = makeSpeakButton(item.source, 'uk-UA');

  const actions = document.createElement('div');
  actions.className = 'vocab-actions';

  if (item.type === 'phrase') {
    const splitBtn = document.createElement('button');
    splitBtn.className = 'small-btn';
    splitBtn.textContent = '分割';
    splitBtn.title = '単語に分割する';
    splitBtn.addEventListener('click', () => {
      splitItem(item.id);
      refreshAll();
    });
    actions.appendChild(splitBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = '削除';
  deleteBtn.addEventListener('click', () => {
    removeItem(item.id);
    selectedForMerge.delete(item.id);
    refreshAll();
  });
  actions.appendChild(deleteBtn);

  const row1 = document.createElement('div');
  row1.className = 'vocab-row';
  row1.appendChild(checkbox);
  row1.appendChild(typeBtn);
  row1.appendChild(sourceInputEl);
  row1.appendChild(speakBtn);

  const row2 = document.createElement('div');
  row2.className = 'vocab-row';
  row2.appendChild(targetInputEl);
  row2.appendChild(catInputEl);

  const row3 = document.createElement('div');
  row3.className = 'vocab-row';
  row3.appendChild(reviewBtn);
  row3.appendChild(actions);

  li.appendChild(row1);
  li.appendChild(row2);
  li.appendChild(row3);
  return li;
}

// ========================= テストタブ =========================
const testSetup = document.getElementById('testSetup');
const testDirection = document.getElementById('testDirection');
const testMode = document.getElementById('testMode');
const testTypeScope = document.getElementById('testTypeScope');
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
  if (testTypeScope.value) pool = pool.filter((it) => it.type === testTypeScope.value);
  if (testScope.value === 'weak') pool = pool.filter((it) => it.weak);
  if (testScope.value === 'due') pool = pool.filter((it) => it.srs.dueDate <= todayStr());
  if (pool.length === 0) {
    alert('対象となる項目がありません。');
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
  testProgress.textContent = `第 ${testIndex + 1} / ${testQueue.length} 問`;

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
      ? '✅ 正解！'
      : `❌ 不正解。正解: ${expected}（あなたの回答: ${userAnswer || '(空欄)'}）`;
  } else {
    testFeedback.textContent = correct ? '✅ 正解！' : '❌ 覚えていない、として記録しました。';
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

// ========================= Init =========================
function refreshDueAndStats() {
  updateDueCount();
}

function refreshAll() {
  refreshCategoryList();
  renderRecentSentences();
  renderVocabList();
  updateDueCount();
}

refreshAll();
