(function(){

  const FALLBACK = [
    'box_emozioni/Amore/2024-02-17_40CF126E-0917-4553-928C-21FB74A00438.webp',
    'box_emozioni/Amore/2024-02-28_1D28872E-69D0-49C2-9879-5090370FFB2A.webp',
    'box_emozioni/Amore/2024-02-28_2479BEF8-291C-4268-BADD-174285EEE9B7.webp',
    'box_emozioni/Amore/2024-03-07_188D4B05-536D-402D-9FD8-964F2F59A19F.webp',
    'box_emozioni/Amore/2024-08-26_4C37321D-C6DA-46C7-A727-8C81CFB2BCD3.webp',
    'box_emozioni/Amore/2024-08-26_549D177D-8A53-40B4-8717-C416CAA04C3E.webp',
    'box_emozioni/Amore/2024-09-15_CB07ABE3-5BA0-4565-8295-68993BC42A99.webp',
    'box_emozioni/Amore/2024-11-21_C936C180-A99B-417B-89B4-9E82D54315B2.webp',
    'box_emozioni/Amore/2025-03-14_9ED7C464-7B1A-4D44-BB1A-F4D7EC1F3A2A.webp',
    'box_emozioni/Amore/2025-04-04_F030B08F-2E0C-402F-AAE1-A1078C82B362.webp',
    'box_emozioni/Amore/2025-10-09_D6F2BA27-9EE7-436D-98D4-4F9FA4377FF7.webp',
    'box_emozioni/Amore/2025-12-23_1A3955FD-D52A-4B6A-A3B4-63E5A92922FE.webp',
    'box_emozioni/Amore/2025-12-29_2BE5796C-9978-400C-B5D3-345E690BEB0F.webp',
    'box_emozioni/Amore/2025-12-29_549BBA9E-974C-4044-9668-49CB2DEA9E2C.webp',
    'box_emozioni/Amore/2025-12-30_4CF7E8E1-7059-480A-9DEB-0C600C5D8907.webp',
    'box_emozioni/Amore/2025-12-30_55285026-EFA1-4506-BD7B-3BE92FD9B6BE.webp',
    'box_emozioni/Amore/2025-12-30_93EB2231-8454-4C5E-A442-082B0752E8DD.webp',
    'box_emozioni/Amore/2026-03-20_71FB6CA4-AF2A-489F-B3CA-C3CFE39BA6E6.webp',
    'box_emozioni/Amore/2026-03-20_92945F18-6993-4AFA-AF14-F764A316BE00.webp',
    'box_emozioni/Amore/2026-03-23_4629AD2F-0160-45D9-8665-399B8602B565.webp',
    'box_emozioni/Ansia/2024-05-28_39BD31B8-248E-4778-8687-273B78359FC6.webp',
    'box_emozioni/Ansia/2024-09-14_A0A8A516-E8BC-4943-A2DB-68CD46C317E4.webp',
    'box_emozioni/Ansia/2024-09-14_B1F3C022-8DFF-4584-B658-C6692CCF874F.webp',
    'box_emozioni/Ansia/2024-09-18_09F1EACE-80B6-4AE3-B01D-1264E58E6EB4.webp',
    'box_emozioni/Ansia/2024-09-18_0EF43A83-0303-4611-8D70-B3B384438681.webp',
    'box_emozioni/Ansia/2024-09-18_7C942C65-1131-401E-B8DA-2624762BD35B.webp',
    'box_emozioni/Ansia/2024-09-18_F4400609-575A-4C49-8B83-BEC5E2CCB58B.webp',
    'box_emozioni/Ansia/2024-11-27_CBD79A9D-7297-412F-A561-C2A87A1232B6.webp',
    'box_emozioni/Ansia/2024-12-16_7FDCF547-8063-4E04-A155-1E224AFC16C6.webp',
    'box_emozioni/Ansia/2024-12-28_71FED2AF-9A28-48EE-B050-1D5C7E9F9EA9.webp',
    'box_emozioni/Ansia/2024-12-28_B7B55896-BE61-42BF-BB2B-A1830B2A4D0C.webp',
    'box_emozioni/Ansia/2024-12-28_E1A0BB0A-9994-450A-8497-F5D28D1B8494.webp'
  ];

  // Globalizziamo la blacklist convertita in minuscolo per massima sicurezza
  const BLACKLIST = [
    "2024-10-06_D0D5BCE7-DA5A-477E-805A-3B9D595B6BD7",
    "2024-10-06_519824B3-FDF5-49B4-BEF8-A3178AA42320",
    "2024-12-09_9522D750-F088-48B1-9EA2-9ED3CEE713A7",
    "2024-12-09_BEF3F15A-0536-479A-8981-EE44CC94A8D5",
    "2024-12-16_7FDCF547-8063-4E04-A155-1E224AFC16C6",
    "2025-02-12_46FD8C72-C2A6-4DB4-9641-1190129C7C41",
    "2025-02-12_F2EF8492-BB8F-4C67-B671-74895ECF8324",
    "2024-12-14_8D45A232-7C4C-4597-B212-F535496C3F05"
  ].map(id => id.toLowerCase());

  // Funzione helper riutilizzabile ovunque per controllare l'esclusione
  function isBlacklisted(src) {
    if (!src) return true;
    const urlLower = src.toLowerCase();
    return BLACKLIST.some(id => urlLower.includes(id));
  }

  function shuffle(list){
    const out = [...list];
    for(let i = out.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function revealDelay(){
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 480;
  }

  function pause(ms){
    return new Promise(r => setTimeout(r, ms));
  }

  async function imagePool(limit){
    let all = [];
    
    try {
      const res = await fetch('emotion-images.json');
      if(res.ok){
        const manifest = await res.json();
        all = Object.values(manifest).flat().filter(Boolean);
      }
    } catch { /* file:// or offline */ }
    
    // Se il file JSON è vuoto o fallisce, usa il Fallback filtrato preventivamente
    if(!all.length) {
      all = FALLBACK.filter(src => !isBlacklisted(src));
    }
    
    const shuffled = shuffle(all);
    const picked = [];
    const seen = new Set();
    
    for(const src of shuffled){
      if(seen.has(src)) continue;
      if(isBlacklisted(src)) continue; 

      seen.add(src);
      picked.push(src);
      if(picked.length >= limit) break;
    }
    return picked;
  }

  function waitForImage(img, ms){
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if(done) return;
        done = true;
        resolve();
      };
      if(img.complete && img.naturalWidth) finish();
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
      setTimeout(finish, ms);
    });
  }

  function resetLanding(){
    document.querySelector('.landing-ui')?.classList.remove('is-visible');
    document.querySelectorAll('.landing-unit').forEach(unit => {
      unit.classList.remove('is-active');
      unit.querySelectorAll('.landing-paren').forEach(p => p.classList.remove('is-visible'));
      unit.querySelectorAll('.landing-word').forEach(w => w.classList.remove('is-visible'));
      unit.querySelectorAll('.landing-slot').forEach(slot => {
        slot.classList.remove('is-visible');
        slot.replaceChildren();
      });
    });
  }

  function revealLandingUi(){
    const ui = document.querySelector('.landing-ui');
    if(ui) ui.classList.add('is-visible');
    document.getElementById('landingEnter')?.focus();
  }

  async function revealSlots(slots, sources, srcIndex, delay){
    // Filtriamo l'array FALLBACK globale rimuovendo a monte le immagini bannate
    const cleanFallback = FALLBACK.filter(src => !isBlacklisted(src));

    for(let i = 0; i < slots.length; i++){
      const slot = slots[i];
      
      // Se finiscono le immagini della sorgente principale, pesca dal fallback pulito
      let src = sources[srcIndex] || cleanFallback[srcIndex % cleanFallback.length];
      srcIndex++;
      
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = src;
      slot.appendChild(img);
      await waitForImage(img, 12000);
      slot.classList.add('is-visible');
      if(delay && i < slots.length - 1) await pause(delay);
    }
    return srcIndex;
  }

  let booting = false;

  async function bootLandingPhotos(){
    if(booting) return;
    const cloud = document.getElementById('landingCloud');
    const units = cloud ? [...cloud.querySelectorAll('.landing-unit')] : [];
    if(!units.length) return;
    booting = true;
    try {
      resetLanding();
      const delay = revealDelay();
      const slotCount = units.reduce((n, unit) => n + unit.querySelectorAll('.landing-slot').length, 0);
      const sources = await imagePool(slotCount);
      let srcIndex = 0;

      for(let u = 0; u < units.length; u++){
        const unit = units[u];
        const wordFirst = unit.classList.contains('landing-unit--word-first');
        const openParen = unit.querySelector('.landing-paren--open');
        const closeParen = unit.querySelector('.landing-paren--close');
        const word = unit.querySelector('.landing-word');
        const slots = [...unit.querySelectorAll('.landing-slot')];

        unit.classList.add('is-active');
        openParen?.classList.add('is-visible');
        if(delay) await pause(delay * 0.35);

        if(wordFirst && word){
          word.classList.add('is-visible');
          if(delay) await pause(delay);
        }

        srcIndex = await revealSlots(slots, sources, srcIndex, delay);

        if(!wordFirst && word){
          if(delay && slots.length) await pause(delay);
          word.classList.add('is-visible');
          if(delay) await pause(delay);
        }

        closeParen?.classList.add('is-visible');
        if(delay && u < units.length - 1) await pause(delay * 0.65);
      }

      if(delay) await pause(delay * 0.5);
      revealLandingUi();
    } finally {
      booting = false;
    }
  }

  window.bootLandingPhotos = bootLandingPhotos;

  function start(){
    if(!document.getElementById('landingCloud')) return;
    void bootLandingPhotos();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.addEventListener('pageshow', e => {
    if(e.persisted) void bootLandingPhotos();
  });
})();