// --- Word splitting, lookup, SRS, grading ---
import { state, saveWords, makeWord, makeId, todayStr, addDays, defaultSrs, defaultStats, bumpTodayAdded } from './storage.js';

// Split a sentence into unique lowercase words, punctuation removed.
export function splitWords(text) {
  const matches = text.match(/[\p{L}\p{M}'’ʼ-]+/gu) || [];
  return [...new Set(matches.map((w) => w.toLowerCase()))];
}

export function findWord(ua) {
  const key = ua.toLowerCase();
  return state.words.find((w) => w.ua.toLowerCase() === key);
}

// Add a word if not already present. Returns the word (existing or new).
export function addWord({ ua, ja = '', reading = '', category = '' }) {
  const existing = findWord(ua);
  if (existing) {
    if (ja && !existing.ja) existing.ja = ja;
    if (reading && !existing.reading) existing.reading = reading;
    saveWords();
    return existing;
  }
  const word = makeWord({ ua, ja, reading, category });
  state.words.push(word);
  saveWords();
  bumpTodayAdded(1);
  return word;
}

export function removeWord(id) {
  state.words = state.words.filter((w) => w.id !== id);
  saveWords();
}

// --- SRS (Anki-like) ---
export function dueWords(filterFn) {
  const today = todayStr();
  return state.words.filter((w) => w.ua && w.ja && w.srs.dueDate <= today && (!filterFn || filterFn(w)));
}

// rating: 'again' | 'hard' | 'good' | 'easy'
export function applyRating(word, rating) {
  const srs = word.srs;
  if (rating === 'again') {
    srs.interval = 0;
    srs.reps = 0;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
    srs.status = 'learning';
    word.weak = true;
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
    if (rating !== 'hard') word.weak = false;
  }
  srs.dueDate = addDays(todayStr(), srs.interval);
  word.stats.lastChecked = todayStr();
  saveWords();
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

// Record a test result for a word and update weak flag + stats.
export function recordTestResult(word, correct) {
  if (correct) {
    word.stats.correct += 1;
    word.weak = false;
  } else {
    word.stats.incorrect += 1;
    word.weak = true;
    // bring weak words back into review soon
    word.srs.dueDate = todayStr();
    word.srs.status = 'learning';
  }
  word.stats.lastChecked = todayStr();
  saveWords();
}

// --- Comprehension ---
export function comprehensionStats(uaWords, { dedupe = true } = {}) {
  const list = dedupe ? [...new Set(uaWords)] : uaWords;
  const total = list.length;
  let known = 0;
  let weakCount = 0;
  list.forEach((ua) => {
    const w = findWord(ua);
    if (w && w.ja) known += 1;
    if (w && w.weak) weakCount += 1;
  });
  return {
    total,
    known,
    unknown: total - known,
    weak: weakCount,
    rate: total === 0 ? 0 : Math.round((known / total) * 100),
  };
}
