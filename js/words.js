// --- Extraction, lookup, SRS, grading for word/phrase/sentence items ---
import {
  state, saveItems, makeWordItem, makeSentenceItem, todayStr, addDays,
  bumpTodayAdded, itemStatus,
} from './storage.js';

// Split text into unique lowercase tokens, punctuation removed.
export function splitWords(text) {
  const matches = text.match(/[\p{L}\p{M}'’ʼ-]+/gu) || [];
  return [...new Set(matches.map((w) => w.toLowerCase()))];
}

// Split a sentence into its constituent words.
export function extractFromSentence(text) {
  return { words: splitWords(text) };
}

export function findItem(source, type) {
  const key = source.trim().toLowerCase();
  return state.items.find((it) => it.type === type && it.source === key);
}

export function findVocabItem(source) {
  const key = source.trim().toLowerCase();
  return state.items.find((it) => (it.type === 'word' || it.type === 'phrase') && it.source === key);
}

// Add a word/phrase item if not already present (matched by type+source).
export function addVocabItem({ source, target = '', reading = '', category = '', type = 'word' }) {
  const existing = findItem(source, type);
  if (existing) {
    if (target && !existing.target) existing.target = target;
    if (reading && !existing.reading) existing.reading = reading;
    saveItems();
    return existing;
  }
  const item = makeWordItem({ source, target, reading, category, type });
  state.items.push(item);
  saveItems();
  bumpTodayAdded(1);
  return item;
}

export function addSentence({ source, target = '', category = '', words = [] }) {
  let known = 0;
  words.forEach((s) => {
    const v = findVocabItem(s);
    if (v && v.target) known += 1;
  });
  const comprehension = words.length === 0 ? 0 : Math.round((known / words.length) * 100);

  const item = makeSentenceItem({ source, target, category, words, phrases: [], comprehension });
  state.items.push(item);
  saveItems();
  return item;
}

export function removeItem(id) {
  state.items = state.items.filter((it) => it.id !== id);
  saveItems();
}

// --- SRS (Anki-like) ---
export function dueWords(filterFn) {
  const today = todayStr();
  return state.items.filter((it) =>
    (it.type === 'word' || it.type === 'phrase') &&
    it.target && it.srs.dueDate <= today && (!filterFn || filterFn(it)));
}

// rating: 'again' | 'hard' | 'good' | 'easy'
export function applyRating(item, rating) {
  const srs = item.srs;
  if (rating === 'again') {
    srs.interval = 0;
    srs.reps = 0;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
    srs.status = 'learning';
    item.weak = true;
  } else {
    if (srs.reps === 0) {
      srs.interval = 1;
    } else if (rating === 'hard') {
      srs.interval = Math.max(1, Math.round(srs.interval * 1.2));
      srs.ease = Math.max(1.3, srs.ease - 0.15);
    } else if (rating === 'good') {
      srs.interval = Math.round(srs.interval * srs.ease) || 1;
    } else if (rating === 'easy') {
      srs.interval = Math.round(srs.interval * srs.ease * 1.3) || 2;
      srs.ease += 0.1;
    }
    srs.reps += 1;
    srs.status = 'review';
    if (rating !== 'hard') item.weak = false;
  }
  srs.dueDate = addDays(todayStr(), srs.interval);
  item.stats.lastChecked = todayStr();
  saveItems();
}

// --- Test grading ---
// Loose match: case/diacritic/whitespace/punctuation insensitive.
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function isCorrectAnswer(answer, expected) {
  return normalize(answer) === normalize(expected);
}

// Record a test result for a word/phrase and update weak flag + stats.
export function recordTestResult(item, correct) {
  if (correct) {
    item.stats.correct += 1;
    item.weak = false;
  } else {
    item.stats.incorrect += 1;
    item.weak = true;
    // bring weak items back into review soon
    item.srs.dueDate = todayStr();
    item.srs.status = 'learning';
  }
  item.stats.lastChecked = todayStr();
  saveItems();
}

// --- Helpers for lists ---
export function vocabItems() {
  return state.items.filter((it) => it.type === 'word' || it.type === 'phrase');
}

export function sentenceItems() {
  return state.items.filter((it) => it.type === 'sentence');
}

export { itemStatus };
