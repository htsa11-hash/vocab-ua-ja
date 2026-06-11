// --- Text-to-speech via SpeechSynthesis (browser built-in) ---

import { t } from './i18n.js';

export const ttsSupported = 'speechSynthesis' in window;

export function speak(text, lang = 'uk-UA') {
  if (!ttsSupported || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  window.speechSynthesis.speak(utter);
}

// Attach a 🔊 button that speaks `text` in `lang`. Returns the button element.
export function makeSpeakButton(text, lang = 'uk-UA') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'speak-btn';
  btn.textContent = '🔊';
  btn.title = t('speakTitle');
  if (!ttsSupported) {
    btn.disabled = true;
    btn.title = t('speakUnsupported');
  } else {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      speak(text, lang);
    });
  }
  return btn;
}
