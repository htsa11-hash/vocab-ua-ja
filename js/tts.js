// --- Text-to-speech via SpeechSynthesis (browser built-in) ---

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
  btn.title = '読み上げ';
  if (!ttsSupported) {
    btn.disabled = true;
    btn.title = 'お使いのブラウザは音声読み上げに対応していません';
  } else {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      speak(text, lang);
    });
  }
  return btn;
}
