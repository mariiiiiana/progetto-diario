function escapeAttr(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function waitForDiary(maxMs = 12000){
  const start = performance.now();
  while(!diaryData){
    if(performance.now() - start > maxMs) throw new Error('Diary data timeout');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}

function themesForEmotionPage(emotionId){
  const wordEntries = entriesForEmotionWords(diaryData, emotionId);
  let themes = topThemesForEmotion(wordEntries, emotionId, 64);
  themes = typeof dedupeThemes === 'function' ? dedupeThemes(themes) : themes;
  if(!themes.length && typeof EMOTION_THEME_OVERRIDES !== 'undefined' && EMOTION_THEME_OVERRIDES[emotionId]){
    themes = dedupeThemes(EMOTION_THEME_OVERRIDES[emotionId]);
  }
  if(!themes.length && typeof FALLBACK_THEMES !== 'undefined' && FALLBACK_THEMES[emotionId]){
    themes = dedupeThemes(FALLBACK_THEMES[emotionId].split(', ').filter(t => t && t !== '—'));
  }
  return themes;
}

async function initEmotionPage(){
  const emotionId = new URLSearchParams(window.location.search).get('e');
  if(!emotionId){
    window.location.replace('index.html');
    return;
  }

  const titleEl = document.getElementById('emotionTitle');
  const metaEl = document.getElementById('emotionMeta');
  const countEl = document.getElementById('emotionCount');
  const listEl = document.getElementById('themeList');

  try {
    await waitForDiary();
  } catch {
    titleEl.textContent = 'unavailable';
    metaEl.textContent = 'could not load diary data';
    return;
  }

  const label = emotionLabel(emotionId);
  const entryCount = entriesForEmotion(diaryData, emotionId).length;
  const themes = themesForEmotionPage(emotionId);

  document.title = `${label} — everything i couldn't say aloud`;
  titleEl.textContent = label;
  titleEl.classList.toggle('has-descenders', typeof hasTextDescenders === 'function' && hasTextDescenders(label));
  countEl.textContent = entryCount;
  metaEl.textContent = `${themes.length} themes`;

  if(!themes.length){
    listEl.innerHTML = '<p class="emotion-empty">No themes found for this emotion.</p>';
    return;
  }

  listEl.innerHTML = themes.map(theme => {
    const safe = escapeAttr(theme);
    return `<span class="decrypt-text" data-text="${safe}" tabindex="0" aria-label="${safe}"></span>`;
  }).join('');

  if(window.DecryptText){
    window.DecryptText.mount(listEl);
  } else {
    listEl.innerHTML = themes.map(t => `<span class="decrypt-text">${escapeAttr(t)}</span>`).join('');
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initEmotionPage);
} else {
  initEmotionPage();
}
