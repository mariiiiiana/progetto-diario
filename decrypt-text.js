/**
 * Cryptic text reveal — scrambled letters, whole theme decodes together on hover.
 * Markup: <span class="decrypt-text" data-text="eating too much" tabindex="0"></span>
 */
(function (global) {
  'use strict';

  const CHARSET_LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const CHARSET_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const DEFAULT_SCRAMBLE_SPEED = 125;
  const DEFAULT_WORD_REVEAL_MS = 90;
  const MIN_LETTER_FLIP_MS = 58;
  const HOVER_SCRAMBLE_FACTOR = 2.2;

  const mounted = new WeakMap();
  let rafId = null;
  const live = new Set();

  function parseMs(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function randomLetter(char) {
    if (!/[a-zA-Z]/.test(char)) return char;
    const pool = char === char.toUpperCase() && char !== char.toLowerCase()
      ? CHARSET_UPPER
      : CHARSET_LOWER;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function letterFlipInterval(speed, word, slow = false) {
    const base = Math.max(MIN_LETTER_FLIP_MS, speed / Math.max(word.length, 2));
    return slow ? base * HOVER_SCRAMBLE_FACTOR : base;
  }

  function isLocked(span) {
    return span.classList.contains('is-active');
  }

  class DecryptText {
    constructor(el) {
      this.el = el;
      this.realText = (el.dataset.text || el.textContent || '').trim();
      this.words = this.realText.split(/\s+/).filter(Boolean);
      this.scrambleSpeed = parseMs(el.dataset.scrambleSpeed, DEFAULT_SCRAMBLE_SPEED);
      this.wordRevealMs = parseMs(el.dataset.wordRevealMs, DEFAULT_WORD_REVEAL_MS);
      this.group = el.closest('[data-decrypt-group]');
      this.wordEls = [];
      this.scrambling = true;
      this.ac = new AbortController();

      if (!this.words.length) return;

      if (global.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = this.realText;
        el.classList.add('is-revealed');
        this.scrambling = false;
        return;
      }

      this.buildWords();
      this.el.style.setProperty('--theme-chars', String(Math.max(this.realText.length, 4)));
      this.bindEvents();
      el.setAttribute('aria-label', this.realText);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

      live.add(this);
      ensureScrambleLoop();
    }

    isThemeLocked() {
      return this.el.classList.contains('is-theme-active');
    }

    resetWordScrambleState(span, word, index, now = performance.now()) {
      span._chars = [...word].map(randomLetter);
      span.textContent = span._chars.join('');
      const stagger = (index % 7) * 14 + Math.floor(index / 7) * 5;
      span._nextFlip = now + stagger;
    }

    buildWords() {
      this.el.innerHTML = '';
      this.wordEls = [];
      const now = performance.now();
      this.words.forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'decrypt-word is-scrambling';
        span.dataset.index = String(i);
        span.setAttribute('aria-hidden', 'true');
        span.style.setProperty('--chars', String(Math.max(word.length, 1)));
        this.resetWordScrambleState(span, word, i, now);
        this.wordEls.push(span);
        this.el.appendChild(span);
        if (i < this.words.length - 1) {
          this.el.appendChild(document.createTextNode(' '));
        }
      });
    }

    bindEvents() {
      const { signal } = this.ac;

      this.el.addEventListener('pointerenter', () => {
        this.lockTheme();
      }, { signal });

      this.el.addEventListener('pointerleave', e => {
        const next = e.relatedTarget;
        if (next && this.el.contains(next)) return;
        this.unlockTheme();
      }, { signal });

      this.el.addEventListener('click', e => {
        if (!e.target.closest('.decrypt-word') && e.target !== this.el) return;
        e.preventDefault();
        this.lockTheme();
      }, { signal });

      this.el.addEventListener('focusin', e => {
        if (e.target !== this.el) return;
        this.lockTheme();
      }, { signal });

      this.el.addEventListener('focusout', e => {
        if (e.relatedTarget && this.el.contains(e.relatedTarget)) return;
        this.unlockTheme();
      }, { signal });
    }

    clearWordScrambleState(span) {
      delete span._chars;
      delete span._nextFlip;
    }

    lockTheme() {
      if (this.isThemeLocked()) return;

      this.wordEls.forEach((span, i) => {
        span.classList.remove('is-scrambling');
        span.classList.add('is-active', 'is-revealed');
        this.clearWordScrambleState(span);
        span.textContent = this.words[i];
        span.setAttribute('aria-hidden', 'false');
      });

      this.el.classList.add('is-focused', 'is-theme-active', 'is-revealed');
      if (this.group) this.group.classList.add('has-focus');
      this.scrambling = true;
      ensureScrambleLoop();
    }

    unlockTheme() {
      if (!this.isThemeLocked()) return;

      const now = performance.now();
      this.wordEls.forEach((span, i) => {
        span.classList.remove('is-active', 'is-revealed');
        span.classList.add('is-scrambling');
        span.setAttribute('aria-hidden', 'true');
        this.resetWordScrambleState(span, this.words[i], i, now);
      });

      this.el.classList.remove('is-focused', 'is-theme-active', 'is-revealed');
      if (this.group && !this.group.querySelector('.decrypt-text.is-theme-active')) {
        this.group.classList.remove('has-focus');
      }
      this.scrambling = true;
      ensureScrambleLoop();
    }

    resetAll() {
      this.unlockTheme();
    }

    tickScramble(now) {
      if (!this.el.isConnected || !this.scrambling || this.isThemeLocked()) return;

      const slowWall = Boolean(this.group?.classList.contains('has-focus'));

      this.wordEls.forEach((span, i) => {
        if (isLocked(span)) return;
        if (!span.classList.contains('is-scrambling')) return;

        const word = this.words[i];
        if (!span._chars) {
          this.resetWordScrambleState(span, word, i, now);
          return;
        }

        if (now < (span._nextFlip || 0)) return;

        const li = Math.floor(Math.random() * word.length);
        span._chars[li] = randomLetter(word[li]);
        span.textContent = span._chars.join('');

        const step = letterFlipInterval(this.scrambleSpeed, word, slowWall);
        span._nextFlip = now + step;
      });
    }

    destroy() {
      this.ac.abort();
      this.wordEls.forEach(span => this.clearWordScrambleState(span));
      this.el.classList.remove('is-focused', 'is-theme-active', 'is-revealed');
      live.delete(this);
      restartScrambleLoop();
    }
  }

  function stopScrambleLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function frameLoop(now) {
    live.forEach(inst => inst.tickScramble(now));
    if (!live.size) {
      stopScrambleLoop();
      return;
    }
    rafId = requestAnimationFrame(frameLoop);
  }

  function restartScrambleLoop() {
    stopScrambleLoop();
    if (!live.size) return;
    rafId = requestAnimationFrame(frameLoop);
  }

  function ensureScrambleLoop() {
    if (!live.size) return;
    if (rafId === null) restartScrambleLoop();
  }

  const boundGroups = new WeakSet();

  function bindGroupLeave(group) {
    if (!group || boundGroups.has(group)) return;
    boundGroups.add(group);
    group.addEventListener('pointerleave', e => {
      const next = e.relatedTarget;
      if (next && group.contains(next)) return;
      group.classList.remove('has-focus');
      group.querySelectorAll('.decrypt-text').forEach(el => {
        const inst = mounted.get(el);
        if (inst) inst.unlockTheme();
      });
    });
  }

  function mount(root = document) {
    const scope = root instanceof Element ? root : document;
    const group = scope.matches?.('[data-decrypt-group]')
      ? scope
      : scope.querySelector?.('[data-decrypt-group]');
    bindGroupLeave(group);
    const groupSpeed = scope.dataset?.scrambleSpeed
      || group?.dataset?.scrambleSpeed;
    scope.querySelectorAll('.decrypt-text').forEach(el => {
      if (mounted.has(el)) return;
      if (groupSpeed && !el.dataset.scrambleSpeed) el.dataset.scrambleSpeed = groupSpeed;
      const inst = new DecryptText(el);
      if (inst.words?.length) mounted.set(el, inst);
    });
    restartScrambleLoop();
  }

  function destroy(root = document) {
    const scope = root instanceof Element ? root : document;
    scope.querySelectorAll('.decrypt-text').forEach(el => {
      const inst = mounted.get(el);
      if (inst) {
        inst.destroy();
        mounted.delete(el);
      }
    });
    const group = scope.querySelector?.('[data-decrypt-group]');
    if (group) group.classList.remove('has-focus');
    restartScrambleLoop();
  }

  global.DecryptText = {
    mount,
    destroy,
    DEFAULT_SCRAMBLE_SPEED,
    DEFAULT_WORD_REVEAL_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
