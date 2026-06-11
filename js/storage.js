// --- Generic helpers & persistent state ---

import { normalizeCategory } from './i18n.js';

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

function defaultSettings() {
  return {
    lang: 'ja',
    lastStudyDate: null,
    streak: 0,
    todayAdded: { date: todayStr(), count: 0 },
    todayLearned: { date: todayStr(), count: 0 },
  };
}

export function defaultSrs() {
  return { interval: 0, ease: 2.5, reps: 0, dueDate: todayStr(), status: 'new' };
}

export function defaultStats() {
  return { correct: 0, incorrect: 0, lastChecked: null, addedDate: todayStr() };
}

// --- Migration from the old { words, sentences } shape to a single items array ---
function migrateOldData() {
  const oldWords = load('vocabWords', null);
  const oldSentences = load('vocabSentences', null);
  if (!oldWords && !oldSentences) return null;

  const items = [];
  (oldWords || []).forEach((w) => {
    items.push({
      id: w.id || makeId(),
      type: 'word',
      source: w.ua || '',
      target: w.ja || '',
      reading: w.reading || '',
      reviewFlag: false,
      date: w.stats?.addedDate || todayStr(),
      weak: !!w.weak,
      srs: w.srs || defaultSrs(),
      stats: w.stats || defaultStats(),
    });
  });
  (oldSentences || []).forEach((s) => {
    items.push({
      id: s.id || makeId(),
      type: 'sentence',
      source: s.ua || '',
      target: s.ja || '',
      category: normalizeCategory(s.category),
      date: s.date || todayStr(),
      words: s.words || [],
      phrases: [],
      comprehension: s.comprehension || 0,
    });
  });

  localStorage.removeItem('vocabWords');
  localStorage.removeItem('vocabSentences');
  return items;
}

function normalizeItemCategories(items) {
  items.forEach((it) => {
    if (it.type === 'sentence') {
      it.category = normalizeCategory(it.category);
      if (!Array.isArray(it.words)) it.words = [];
    } else {
      delete it.category;
      if (!it.srs) it.srs = defaultSrs();
      if (!it.stats) it.stats = defaultStats();
      if (typeof it.weak !== 'boolean') it.weak = false;
      if (typeof it.reviewFlag !== 'boolean') it.reviewFlag = false;
      if (typeof it.target !== 'string') it.target = '';
      if (typeof it.source !== 'string') it.source = '';
    }
  });
  return items;
}

export const state = {
  items: normalizeItemCategories(load('vocabItems', null) || migrateOldData() || []),
  settings: load('vocabSettings', defaultSettings()),
};

save('vocabItems', state.items);

export function saveItems() {
  save('vocabItems', state.items);
}

export function saveSettings() {
  save('vocabSettings', state.settings);
}

// --- Item factories ---
export function makeWordItem({ source, target = '', reading = '', type = 'word' }) {
  return {
    id: makeId(),
    type, // 'word' | 'phrase'
    source: source.trim().toLowerCase(),
    target,
    reading,
    reviewFlag: false,
    date: todayStr(),
    weak: false,
    srs: defaultSrs(),
    stats: defaultStats(),
  };
}

export function makeSentenceItem({ source, target = '', category = '', words = [], phrases = [], comprehension = 0 }) {
  return {
    id: makeId(),
    type: 'sentence',
    source,
    target,
    category: normalizeCategory(category),
    date: todayStr(),
    words,
    phrases,
    comprehension,
  };
}

export function itemStatus(item) {
  if (item.reviewFlag) return 'needs_review';
  return item.target && item.target.trim() ? 'translated' : 'untranslated';
}

// --- Export / Import ---
export function exportData() {
  return JSON.stringify({ items: state.items, settings: state.settings }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (Array.isArray(data.items)) state.items = normalizeItemCategories(data.items);
  if (data.settings) state.settings = data.settings;
  saveItems();
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
