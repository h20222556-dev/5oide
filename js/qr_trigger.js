/**
 * qr_trigger.js — QR 스캔 진입 버튼 및 지연 로딩 컨트롤러
 * - 초기 페이지 로딩 부담을 최소화하기 위해 모달 코드(js/qr_modal.js)와 스타일(css/qr_modal.css)은
 *   사용자가 QR 버튼을 처음 클릭할 때만 동적으로 불러옵니다.
 * - "새로 시작" 버튼 반응 속도에 영향을 주지 않습니다.
 */

'use strict';

class QrTriggerController {
  constructor() {
    this.config = {
      QR_CODE_LENGTH: 6,
      QR_PREFIX: 'CCDATE:',
      QR_BUTTON_ENABLED: true,
      QR_BUTTON_SCREENS: ['title', 'game'],
      QR_STORAGE_KEY: 'qrScannedCodes',
    };
    this.engine = null;
    this.ui = null;
    this.btnEl = null;
    this.currentScreen = null;
    this.isSuppressed = false;
    this._modalInstance = null;
    this._loadingPromise = null;
  }

  async init(engine, ui) {
    this.engine = engine || null;
    this.ui = ui || null;
    this._ensureButton();
    this._updateVisibility();

    try {
      const res = await fetch('config/qr_config.json');
      if (res.ok) {
        const loaded = await res.json();
        this.config = Object.assign({}, this.config, loaded || {});
      }
    } catch (err) {
      console.warn('[QrTrigger] config/qr_config.json 로드 실패, 기본값 사용:', err);
    }

    this._updateVisibility();
  }

  _ensureButton() {
    let btn = document.getElementById('btn-qr-scan');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-qr-scan';
      btn.className = 'qr-entry-btn hidden';
      btn.setAttribute('aria-label', 'QR 코드 스캔');
      btn.setAttribute('title', 'QR 코드 스캔');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h3v3h-3v-3zm4 0h3v3h-3v-3zm-4 4h3v3h-3v-3zm4 0h3v3h-3v-3z"/>
        </svg>
      `;
      document.body.appendChild(btn);
    }
    this.btnEl = btn;
    this.btnEl.onclick = (e) => {
      e.stopPropagation();
      this.openModal();
    };
  }

  setScreen(screenId) {
    this.currentScreen = screenId || null;
    if (this.btnEl) {
      this.btnEl.classList.toggle('in-game', screenId === 'game');
      this.btnEl.classList.toggle('in-title', screenId === 'title');
    }
    this._updateVisibility();
  }

  setSuppressed(suppressed) {
    this.isSuppressed = !!suppressed;
    this._updateVisibility();
  }

  _updateVisibility() {
    if (!this.btnEl) return;
    const enabled = this.config.QR_BUTTON_ENABLED !== false;
    const screens = Array.isArray(this.config.QR_BUTTON_SCREENS)
      ? this.config.QR_BUTTON_SCREENS
      : ['title', 'game'];
    const show = enabled && !this.isSuppressed && !!this.currentScreen && screens.includes(this.currentScreen);
    this.btnEl.classList.toggle('hidden', !show);
  }

  isModalOpen() {
    return !!(this._modalInstance && this._modalInstance.isOpen());
  }

  async openModal() {
    const modal = await this._loadModalModule();
    if (!modal) return;
    modal.open('camera');
  }

  closeModal() {
    if (this._modalInstance && this._modalInstance.isOpen()) {
      this._modalInstance.close();
    }
  }

  _loadCssOnce(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  _loadScriptOnce(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async _loadModalModule() {
    if (this._modalInstance) return this._modalInstance;
    if (this._loadingPromise) return this._loadingPromise;

    this._loadingPromise = (async () => {
      try {
        await this._loadCssOnce('css/qr_modal.css');
        if (typeof window.QrModal !== 'function') {
          await this._loadScriptOnce('js/qr_modal.js');
        }
        if (typeof window.QrModal === 'function') {
          this._modalInstance = new window.QrModal({
            config: this.config,
            onOpen: () => {
              if (this.ui) this.ui._qrModalOpen = true;
              if (this.engine && typeof this.engine.pauseForModal === 'function') {
                this.engine.pauseForModal();
              }
            },
            onClose: () => {
              if (this.ui) this.ui._qrModalOpen = false;
              if (this.engine && typeof this.engine.resumeFromModal === 'function') {
                this.engine.resumeFromModal();
              }
            },
          });
        }
        return this._modalInstance;
      } catch (err) {
        console.error('[QrTrigger] QR 모달 로드 실패:', err);
        this._loadingPromise = null;
        return null;
      }
    })();

    return this._loadingPromise;
  }
}
