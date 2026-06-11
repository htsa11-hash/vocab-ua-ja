// --- Generic helpers & persistent state ---

export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const state = {
  words: load('vocabWords', []),
  sentences: load('vocabSentences', []),
  settings: load('vocabSettings', {
    lastStudyDate: null,
    streak: 0,
    todayAdded: { date: todayStr(), count: 0 },
    todayLearned: { date: todayStr(), count: 0 },
  }),
};

export function saveWords() {
  save('vocabWords', state.words);
}

export function saveSentences() {
  save('vocabSentences', state.sentences);
}

export function saveSettings() {
  save('vocabSettings', state.settings);
}

// --- Default factories ---
export function defaultSrs() {
  return { interval: 0, ease: 2.5, reps: 0, dueDate: todayStr(), status: 'new' };
}

export function defaultStats() {
  return { correct: 0, incorrect: 0, lastChecked: null, addedDate: todayStr() };
}

export function makeWord({ ua, ja = '', reading = '', category = '' }) {
  return {
    id: makeId(),
    ua: ua.toLowerCase(),
    ja,
    reading,
    category,
    examples: [],
    weak: false,
    srs: defaultSrs(),
    stats: defaultStats(),
  };
}

// --- Export / Import ---
export function exportData() {
  return JSON.stringify({ words: state.words, sentences: state.sentences, settings: state.settings }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (Array.isArray(data.words)) state.words = data.words;
  if (Array.isArray(data.sentences)) state.sentences = data.sentences;
  if (data.settings) state.settings = data.settings;
  saveWords();
  saveSentences();
  saveSettings();
}

// --- Daily counters ---
export function bumpTodayAdded(n = 1) {
  const t = todayStr();
  if (state.settings.todayAdded.date !== t) state.settings.todayAdded = { date: t, count: 0 };
  state.settings.todayAdded.count += n;
  saveSettings();
}

export function bumpTodayLearned(n = 1) {
  const t = todayStr();
  if (state.settings.todayLearned.date !== t) state.settings.todayLearned = { date: t, count: 0 };
  state.settings.todayLearned.count += n;
  saveSettings();
}

export function bumpStreak() {
  const t = todayStr();
  const last = state.settings.lastStudyDate;
  if (last === t) return;
  if (last && addDays(last, 1) === t) {
    state.settings.streak += 1;
  } else {
    state.settings.streak = 1;
  }
  state.settings.lastStudyDate = t;
  saveSettings();
}
