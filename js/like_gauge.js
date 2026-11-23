/**
 * like_gauge.js — 선택 직후 표시되는 호감도 하트 게이지 연출 컴포넌트 (LikeGauge)
 * - 숫자 및 기준치 미표시
 * - 이전 상태 -> 새 상태 하트 채움 애니메이션 (transform / opacity 전용)
 * - 겹치는 호출은 큐에 쌓아 순서대로 1개씩 표시
 * - pointer-events: none 으로 클릭/자동/스킵 진행을 막지 않음
 */

'use strict';

class LikeGauge {
  constructor(getHostEl) {
    this._getHostEl = typeof getHostEl === 'function'
      ? getHostEl
      : () => document.getElementById('game-wrapper') || document.body;

    this.enabled = true;
    this.assetManifest = null;
    this.gender = 'female';

    this._queue = [];
    this._active = false;
    this._uid = 0;
    this._timers = [];
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
  }

  setAssetManifest(manifest) {
    this.assetManifest = manifest || null;
  }

  setGender(gender) {
    this.gender = gender || 'female';
  }

  show({ charId, charName, delta, prevVal = 0, nextVal = 0, compact = false, labelMode = null, gender = null }) {
    if (!this.enabled) return;
    if (!delta || delta === 0) return;

    this._queue.push({
      charId,
      charName: charName || charId || '',
      delta,
      prevVal: Number(prevVal) || 0,
      nextVal: Number(nextVal) || 0,
      compact: !!compact,
      labelMode: labelMode || null,
      gender: gender || this.gender || 'female',
    });

    this._drain();
  }

  clear() {
    this._queue = [];
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    this._active = false;
    const host = this._getHostEl();
    const stack = host && host.querySelector('.like-gauge-host');
    if (stack) stack.innerHTML = '';
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter(t => t !== id);
      fn();
    }, ms);
    this._timers.push(id);
    return id;
  }

  _drain() {
    if (this._active || this._queue.length === 0) return;
    const item = this._queue.shift();
    this._active = true;
    this._renderCard(item);
  }

  _heartFillRatio(score, heartIdx) {
    const clamped = Math.max(0, Math.min(10, score));
    return Math.max(0, Math.min(1, (clamped - heartIdx * 2) / 2));
  }

  _renderCard(item) {
    const host = this._getHostEl();
    if (!host) {
      this._active = false;
      return;
    }

    let container = host.querySelector('.like-gauge-host');
    if (!container) {
      container = document.createElement('div');
      container.className = 'like-gauge-host';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      host.appendChild(container);
    }

    const isNegative = item.delta < 0;
    const isBig = !isNegative && item.labelMode !== 'up' && item.delta >= 2;
    const tone = isNegative ? 'down' : (isBig ? 'up-big' : 'up');
    const labelText = isNegative
      ? '호감도가 감소했다'
      : (isBig ? '호감도가 크게 상승했다' : '호감도가 상승했다');

    const reducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const uid = ++this._uid;
    const spritePath = this.assetManifest?.characters?.[item.gender]?.[item.charId]?.default || null;
    const initialChar = (item.charName || '?').charAt(0);

    const avatarHtml = spritePath
      ? `<div class="like-gauge-avatar"><img src="${spritePath}" alt="${item.charName}"></div>`
      : `<div class="like-gauge-avatar like-gauge-avatar-fallback" aria-hidden="true">${initialChar}</div>`;

    const heartsHtml = Array.from({ length: 5 }, (_, i) => {
      const prevFill = this._heartFillRatio(item.prevVal, i);
      const nextFill = this._heartFillRatio(item.nextVal, i);
      const initialFill = reducedMotion ? nextFill : prevFill;
      const clipId = `lg-heart-clip-${uid}-${i}`;
      return `
        <span class="like-heart-slot" data-heart-idx="${i}">
          <svg class="like-heart-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="${clipId}">
                <rect class="like-heart-clip-rect" x="0" y="0" width="24" height="24"
                  style="transform: scaleX(${initialFill}); transform-origin: 0 0;" />
              </clipPath>
            </defs>
            <path class="like-heart-empty"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            <path class="like-heart-filled" clip-path="url(#${clipId})"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
      `;
    }).join('');

    const sparklesHtml = (isBig && !reducedMotion)
      ? `
        <svg class="like-gauge-sparkle sparkle-1" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 0 L9.8 6.2 L16 8 L9.8 9.8 L8 16 L6.2 9.8 L0 8 L6.2 6.2 Z" fill="var(--pink-main)" />
        </svg>
        <svg class="like-gauge-sparkle sparkle-2" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M8 0 L9.8 6.2 L16 8 L9.8 9.8 L8 16 L6.2 9.8 L0 8 L6.2 6.2 Z" fill="var(--lavender)" />
        </svg>
      `
      : '';

    const card = document.createElement('div');
    card.className = `like-gauge-card tone-${tone}`;
    card.innerHTML = `
      ${avatarHtml}
      <div class="like-gauge-body">
        <div class="like-gauge-top">
          <span class="like-gauge-name">${item.charName}</span>
          <div class="like-hearts-row" role="img" aria-label="${item.charName} 호감도">
            ${heartsHtml}
            ${sparklesHtml}
          </div>
        </div>
        <div class="like-gauge-label">${labelText}</div>
      </div>
    `;

    // 이미지 로드 실패 시 라벤더 이니셜 원으로 대체
    const avatarImg = card.querySelector('.like-gauge-avatar img');
    if (avatarImg) {
      avatarImg.onerror = () => {
        const av = card.querySelector('.like-gauge-avatar');
        if (av) {
          av.classList.add('like-gauge-avatar-fallback');
          av.setAttribute('aria-hidden', 'true');
          av.textContent = initialChar;
        }
      };
    }

    container.innerHTML = '';
    container.appendChild(card);

    // 등장 애니메이션
    requestAnimationFrame(() => {
      card.classList.add('is-visible');
    });

    // 이전 상태 -> 새 상태로 하트 변화 연출
    if (!reducedMotion) {
      this._later(() => {
        const slots = card.querySelectorAll('.like-heart-slot');
        slots.forEach((slotEl, i) => {
          const prevFill = this._heartFillRatio(item.prevVal, i);
          const nextFill = this._heartFillRatio(item.nextVal, i);
          const rect = slotEl.querySelector('.like-heart-clip-rect');
          if (rect) {
            rect.style.transform = `scaleX(${nextFill})`;
          }
          if (nextFill > prevFill) {
            slotEl.classList.add('heart-pop');
          } else if (nextFill < prevFill) {
            slotEl.classList.add('heart-shake');
          }
        });
        if (isBig) {
          card.classList.add('sparkles-active');
        }
      }, 220);
    }

    const holdMs = isBig ? 1650 : (item.compact ? 1250 : 1450);
    this._later(() => {
      card.classList.remove('is-visible');
      card.classList.add('is-leaving');
      this._later(() => {
        if (card.parentNode) card.remove();
        this._active = false;
        this._drain();
      }, reducedMotion ? 20 : 280);
    }, holdMs);
  }
}
