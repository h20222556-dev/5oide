/**
 * qr_modal.js — QR 코드 통합 처리(QrResolver) 및 스캔/입력 모달(QrModal)
 * - 카메라 스캔과 숫자 코드 직접 입력은 모두 QrResolver.resolveCode()를 거쳐 동일한 결과 화면을 표시합니다.
 * - 외부 CDN을 사용하지 않으며, BarcodeDetector 미지원 시 로컬 vendor/jsQR.js를 지연 로딩합니다.
 * - 스토리, 선택지, 호감도, 엔딩 분기, 세이브 슬롯에 전혀 영향을 주지 않습니다.
 */

(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    QR_CODE_LENGTH: 6,
    QR_PREFIX: 'CCDATE:',
    QR_BUTTON_ENABLED: true,
    QR_BUTTON_SCREENS: ['title', 'game'],
    QR_STORAGE_KEY: 'qrScannedCodes',
  };

  // localStorage 접근 불가 시 세션 내 폴백 저장소
  const memoryScannedStore = {};

  function toHalfWidthDigits(str) {
    return String(str || '').replace(/[\uFF10-\uFF19]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30)
    );
  }

  function readScannedMap(storageKey, storage) {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (store) {
      try {
        const raw = store.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_) {
        // localStorage 차단/손상 시 메모리 폴백 사용
      }
    }
    return Object.assign({}, memoryScannedStore[storageKey] || {});
  }

  function writeScannedMap(storageKey, map, storage) {
    memoryScannedStore[storageKey] = Object.assign({}, map);
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (store) {
      try {
        store.setItem(storageKey, JSON.stringify(map));
      } catch (_) {
        // 저장 실패 시에도 결과 화면 표시는 정상 유지
      }
    }
  }

  /**
   * 통합 코드 처리 함수 (카메라 스캔 / 숫자 직접 입력 공용)
   * @param {string} raw
   * @param {object} [options] - { entries, config, storage, now }
   * @returns {{ ok: true, entry: object, isNew: boolean, code: string } | { ok: false, reason: string, message: string }}
   */
  function resolveCode(raw, options) {
    const opts = options || {};
    const config = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
    const entries = Array.isArray(opts.entries) ? opts.entries : [];
    const codeLen = Number(config.QR_CODE_LENGTH) || 6;
    const prefix = String(config.QR_PREFIX || 'CCDATE:');
    const storageKey = String(config.QR_STORAGE_KEY || 'qrScannedCodes');

    const normalized = toHalfWidthDigits(String(raw == null ? '' : raw)).trim();
    if (!normalized) {
      return {
        ok: false,
        reason: 'invalid_format',
        message: `${codeLen}자리 숫자를 입력해 주세요.`,
      };
    }

    let extractedDigits = null;

    if (normalized.startsWith(prefix)) {
      const rest = normalized.slice(prefix.length).replace(/[\s-]+/g, '');
      if (!new RegExp(`^\\d{${codeLen}}$`).test(rest)) {
        return {
          ok: false,
          reason: 'not_found',
          message: '등록되지 않은 코드예요. 숫자를 다시 확인해 주세요.',
        };
      }
      extractedDigits = rest;
    } else if (/^[\d\s-]+$/.test(normalized)) {
      const digitsOnly = normalized.replace(/[\s-]+/g, '');
      if (digitsOnly.length !== codeLen) {
        return {
          ok: false,
          reason: 'invalid_format',
          message: `${codeLen}자리 숫자를 입력해 주세요.`,
        };
      }
      extractedDigits = digitsOnly;
    } else {
      return {
        ok: false,
        reason: 'not_our_qr',
        message: '이 게임의 QR 코드가 아니에요.',
      };
    }

    const matched = entries.find((item) => item && String(item.code) === extractedDigits);
    if (!matched) {
      return {
        ok: false,
        reason: 'not_found',
        message: '등록되지 않은 코드예요. 숫자를 다시 확인해 주세요.',
      };
    }

    const scannedMap = readScannedMap(storageKey, opts.storage);
    const isNew = !Object.prototype.hasOwnProperty.call(scannedMap, matched.id);
    if (isNew) {
      scannedMap[matched.id] = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
      writeScannedMap(storageKey, scannedMap, opts.storage);
    }

    return {
      ok: true,
      entry: matched,
      isNew,
      code: extractedDigits,
    };
  }

  function sanitizeNumericInput(raw, maxLen) {
    const len = Number(maxLen) || 6;
    const half = toHalfWidthDigits(String(raw || ''));
    // 숫자, 공백, 하이픈만 허용하고 숫자 개수는 maxLen으로 제한
    let digits = 0;
    let out = '';
    for (let i = 0; i < half.length; i++) {
      const ch = half[i];
      if (ch >= '0' && ch <= '9') {
        if (digits < len) {
          out += ch;
          digits++;
        }
      } else if ((ch === ' ' || ch === '-') && out.length > 0 && digits < len) {
        // 연속 구분자 방지
        const prev = out[out.length - 1];
        if (prev !== ' ' && prev !== '-') {
          out += ch;
        }
      }
    }
    return out;
  }

  const QrResolver = {
    DEFAULT_CONFIG,
    toHalfWidthDigits,
    sanitizeNumericInput,
    resolveCode,
    readScannedMap,
  };

  // Node.js 환경(테스트 스크립트 등)에서는 QrResolver만 export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QrResolver };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  global.QrResolver = QrResolver;

  // ════════════════════════════════════════════════════════════════════════════
  // QrModal — 카메라 스캔 / 숫자 입력 / 결과 표시 모달
  // ════════════════════════════════════════════════════════════════════════════

  class QrModal {
    constructor(options) {
      const opts = options || {};
      this.config = Object.assign({}, DEFAULT_CONFIG, opts.config || {});
      this.onOpenCallback = typeof opts.onOpen === 'function' ? opts.onOpen : null;
      this.onCloseCallback = typeof opts.onClose === 'function' ? opts.onClose : null;

      this._isOpen = false;
      this._activeTab = 'camera'; // 'camera' | 'manual'
      this._inResultView = false;
      this._entries = null;
      this._entriesPromise = null;
      this._prevFocusEl = null;

      // 카메라 / 디코더 상태
      this._stream = null;
      this._rafId = null;
      this._camSessionId = 0;
      this._lastScanTs = 0;
      this._lastDecodedRaw = '';
      this._lastDecodedTs = 0;
      this._detector = null;
      this._detectorChecked = false;
      this._jsQrPromise = null;
      this._offscreenCanvas = null;
      this._offscreenCtx = null;

      this._boundKeydown = this._handleKeydown.bind(this);
      this._boundVisibility = this._handleVisibilityChange.bind(this);
      this._boundPageHide = this._handlePageHide.bind(this);
      this._boundViewportResize = this._handleViewportResize.bind(this);

      this._buildDom();
    }

    isOpen() {
      return this._isOpen;
    }

    _buildDom() {
      let overlay = document.getElementById('modal-qr-scan');
      if (overlay) {
        this.overlay = overlay;
        this._cacheElements();
        return;
      }

      overlay = document.createElement('div');
      overlay.id = 'modal-qr-scan';
      overlay.className = 'modal-overlay qr-modal-overlay hidden';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'qr-modal-title');

      const codeLen = Number(this.config.QR_CODE_LENGTH) || 6;

      overlay.innerHTML = `
        <div class="modal-content qr-modal-content">
          <div class="modal-header qr-modal-header">
            <h2 id="qr-modal-title">QR 코드 스캔</h2>
            <button type="button" class="modal-close qr-modal-close" id="btn-close-qr" aria-label="닫기">
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div id="qr-main-view">
            <div class="qr-tablist" role="tablist" aria-label="QR 확인 방식 선택">
              <button type="button" class="qr-tab-btn" id="qr-tab-camera" role="tab" aria-selected="true" aria-controls="qr-panel-camera" tabindex="0">카메라 스캔</button>
              <button type="button" class="qr-tab-btn" id="qr-tab-manual" role="tab" aria-selected="false" aria-controls="qr-panel-manual" tabindex="-1">코드 입력</button>
            </div>

            <!-- 카메라 스캔 탭 -->
            <div id="qr-panel-camera" class="qr-tabpanel" role="tabpanel" aria-labelledby="qr-tab-camera">
              <div class="qr-camera-frame" id="qr-camera-frame">
                <video id="qr-video" class="qr-video" playsinline muted autoplay></video>
                <div class="qr-guide-overlay" aria-hidden="true">
                  <span class="qr-corner tl"></span>
                  <span class="qr-corner tr"></span>
                  <span class="qr-corner bl"></span>
                  <span class="qr-corner br"></span>
                </div>
                <div id="qr-camera-error" class="qr-camera-error hidden" role="alert">
                  <p id="qr-camera-error-text" class="qr-camera-error-text"></p>
                  <div class="qr-camera-error-actions">
                    <button type="button" class="qr-btn qr-btn-primary" id="btn-qr-err-manual">코드 입력</button>
                    <button type="button" class="qr-btn qr-btn-secondary" id="btn-qr-err-retry">다시 시도</button>
                  </div>
                </div>
              </div>
              <p id="qr-camera-status" class="qr-status-text" aria-live="polite">카메라를 QR 코드에 비춰 주세요.</p>
              <button type="button" class="qr-link-btn" id="btn-qr-switch-manual">카메라가 안 되나요? 숫자 코드 입력하기</button>
            </div>

            <!-- 코드 직접 입력 탭 -->
            <div id="qr-panel-manual" class="qr-tabpanel hidden" role="tabpanel" aria-labelledby="qr-tab-manual">
              <form id="qr-manual-form" class="qr-manual-form" novalidate>
                <label for="qr-code-input" class="qr-input-label">QR 아래의 숫자 코드</label>
                <input
                  id="qr-code-input"
                  class="qr-code-input"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="예: 482 915 (${codeLen}자리)"
                  aria-describedby="qr-input-error"
                />
                <div id="qr-input-error" class="qr-input-error hidden" role="alert">
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                    <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M10 6v5M10 13.8v.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span id="qr-input-error-text"></span>
                </div>
                <button type="submit" class="qr-btn qr-btn-primary qr-submit-btn" id="btn-qr-submit">확인</button>
              </form>
            </div>
          </div>

          <!-- 통합 결과 화면 -->
          <div id="qr-result-view" class="qr-result-view hidden" aria-live="polite">
            <div class="qr-result-badge" id="qr-result-badge">새로 확인한 코드</div>
            <h3 class="qr-result-title" id="qr-result-title"></h3>
            <div class="qr-result-image-wrap hidden" id="qr-result-image-wrap">
              <img id="qr-result-image" class="qr-result-image" alt="" />
            </div>
            <p class="qr-result-message" id="qr-result-message"></p>
            <button type="button" class="qr-btn qr-btn-primary qr-result-ok-btn" id="btn-qr-result-ok">확인</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.overlay = overlay;
      this._cacheElements();
      this._bindEvents();
    }

    _cacheElements() {
      const q = (id) => document.getElementById(id);
      this.contentEl = this.overlay.querySelector('.qr-modal-content');
      this.closeBtn = q('btn-close-qr');
      this.mainView = q('qr-main-view');
      this.resultView = q('qr-result-view');

      this.tabCamera = q('qr-tab-camera');
      this.tabManual = q('qr-tab-manual');
      this.panelCamera = q('qr-panel-camera');
      this.panelManual = q('qr-panel-manual');

      this.videoEl = q('qr-video');
      this.cameraStatus = q('qr-camera-status');
      this.cameraErrorBox = q('qr-camera-error');
      this.cameraErrorText = q('qr-camera-error-text');
      this.btnErrManual = q('btn-qr-err-manual');
      this.btnErrRetry = q('btn-qr-err-retry');
      this.btnSwitchManual = q('btn-qr-switch-manual');

      this.manualForm = q('qr-manual-form');
      this.codeInput = q('qr-code-input');
      this.inputErrorBox = q('qr-input-error');
      this.inputErrorText = q('qr-input-error-text');
      this.submitBtn = q('btn-qr-submit');

      this.resultBadge = q('qr-result-badge');
      this.resultTitle = q('qr-result-title');
      this.resultImageWrap = q('qr-result-image-wrap');
      this.resultImage = q('qr-result-image');
      this.resultMessage = q('qr-result-message');
      this.resultOkBtn = q('btn-qr-result-ok');
    }

    _bindEvents() {
      // 모달 내부 클릭이 배경 게임으로 전파되지 않도록 차단 (바깥 클릭으로 닫히지 않음)
      this.overlay.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      this.closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });

      this.tabCamera.addEventListener('click', () => this.switchTab('camera'));
      this.tabManual.addEventListener('click', () => this.switchTab('manual'));

      const handleTabKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = this._activeTab === 'camera' ? 'manual' : 'camera';
          this.switchTab(next);
          (next === 'camera' ? this.tabCamera : this.tabManual).focus();
        }
      };
      this.tabCamera.addEventListener('keydown', handleTabKey);
      this.tabManual.addEventListener('keydown', handleTabKey);

      this.btnSwitchManual.addEventListener('click', () => this.switchTab('manual'));
      this.btnErrManual.addEventListener('click', () => this.switchTab('manual'));
      this.btnErrRetry.addEventListener('click', () => this._startCamera());

      this.codeInput.addEventListener('input', () => {
        const sanitized = QrResolver.sanitizeNumericInput(
          this.codeInput.value,
          this.config.QR_CODE_LENGTH
        );
        if (this.codeInput.value !== sanitized) {
          this.codeInput.value = sanitized;
        }
        this._clearInputError();
      });

      this.manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this._submitManualCode();
      });

      this.resultOkBtn.addEventListener('click', () => this.close());

      this.resultImage.addEventListener('error', () => {
        this.resultImageWrap.classList.add('hidden');
      });
    }

    async _ensureEntriesLoaded() {
      if (Array.isArray(this._entries)) return this._entries;
      if (this._entriesPromise) return this._entriesPromise;

      this._entriesPromise = (async () => {
        try {
          const res = await fetch('data/qr_codes.json');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          this._entries = Array.isArray(data) ? data : [];
        } catch (err) {
          console.error('[QrModal] data/qr_codes.json 로드 실패:', err);
          this._entries = [];
        }
        return this._entries;
      })();

      return this._entriesPromise;
    }

    async open(initialTab) {
      if (this._isOpen) return;

      this._prevFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this._isOpen = true;
      this._inResultView = false;
      this._lastDecodedRaw = '';
      this._lastDecodedTs = 0;

      this.mainView.classList.remove('hidden');
      this.resultView.classList.add('hidden');
      this.codeInput.value = '';
      this._clearInputError();
      this._hideCameraError();

      this.overlay.classList.remove('hidden');

      document.addEventListener('keydown', this._boundKeydown, true);
      document.addEventListener('visibilitychange', this._boundVisibility);
      window.addEventListener('pagehide', this._boundPageHide);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._boundViewportResize);
      }

      if (this.onOpenCallback) this.onOpenCallback();

      // 코드 데이터 백그라운드 로드
      this._ensureEntriesLoaded();

      const tab = initialTab === 'manual' ? 'manual' : 'camera';
      this.switchTab(tab);

      // 모달 오픈 시 접근성 포커스 이동
      requestAnimationFrame(() => {
        if (!this._isOpen) return;
        if (tab === 'manual') {
          this.codeInput.focus();
        } else {
          this.tabCamera.focus();
        }
      });
    }

    close() {
      if (!this._isOpen) return;
      this._isOpen = false;
      this._inResultView = false;

      this._stopCamera();
      this.overlay.classList.add('hidden');
      this.overlay.style.height = '';

      document.removeEventListener('keydown', this._boundKeydown, true);
      document.removeEventListener('visibilitychange', this._boundVisibility);
      window.removeEventListener('pagehide', this._boundPageHide);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._boundViewportResize);
      }

      if (this.onCloseCallback) this.onCloseCallback();

      if (this._prevFocusEl && typeof this._prevFocusEl.focus === 'function') {
        try {
          this._prevFocusEl.focus();
        } catch (_) {}
      }
      this._prevFocusEl = null;
    }

    switchTab(tab) {
      const target = tab === 'manual' ? 'manual' : 'camera';
      this._activeTab = target;

      const isCamera = target === 'camera';
      this.tabCamera.setAttribute('aria-selected', isCamera ? 'true' : 'false');
      this.tabCamera.tabIndex = isCamera ? 0 : -1;
      this.tabManual.setAttribute('aria-selected', isCamera ? 'false' : 'true');
      this.tabManual.tabIndex = isCamera ? -1 : 0;

      this.panelCamera.classList.toggle('hidden', !isCamera);
      this.panelManual.classList.toggle('hidden', isCamera);

      if (isCamera) {
        this._startCamera();
      } else {
        this._stopCamera();
        this._clearInputError();
        requestAnimationFrame(() => {
          if (this._isOpen && this._activeTab === 'manual' && !this._inResultView) {
            this.codeInput.focus();
          }
        });
      }
    }

    // ─── 키보드(ESC 닫기, Tab 포커스 트랩) & 생명주기 ─────────────────────────

    _handleKeydown(e) {
      if (!this._isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = this._getFocusableElements();
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !this.overlay.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !this.overlay.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    _getFocusableElements() {
      const selector = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(this.overlay.querySelectorAll(selector)).filter((el) => {
        if (el.closest('.hidden')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }

    _handleVisibilityChange() {
      if (!this._isOpen) return;
      if (document.hidden) {
        this._stopCamera();
      } else if (this._activeTab === 'camera' && !this._inResultView) {
        this._startCamera();
      }
    }

    _handlePageHide() {
      this._stopCamera();
    }

    _handleViewportResize() {
      if (!this._isOpen || !window.visualViewport) return;
      this.overlay.style.height = `${window.visualViewport.height}px`;
      if (this._activeTab === 'manual' && document.activeElement === this.codeInput) {
        this.codeInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    // ─── 카메라 제어 및 QR 디코딩 ─────────────────────────────────────────────

    _setCameraStatus(text) {
      if (this.cameraStatus) this.cameraStatus.textContent = text;
    }

    _showCameraError(message) {
      this._stopCamera();
      if (this.cameraErrorText) this.cameraErrorText.textContent = message;
      if (this.cameraErrorBox) this.cameraErrorBox.classList.remove('hidden');
      this._setCameraStatus(message);
    }

    _hideCameraError() {
      if (this.cameraErrorBox) this.cameraErrorBox.classList.add('hidden');
    }

    async _startCamera() {
      this._stopCamera();
      this._hideCameraError();

      const sessionId = ++this._camSessionId;

      const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
      const secureOk = window.isSecureContext || isLocalhost;
      if (!secureOk || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        this._showCameraError('이 브라우저에서는 카메라를 사용할 수 없어요. 아래에서 숫자 코드를 직접 입력해 주세요.');
        return;
      }

      this._setCameraStatus('카메라를 준비하는 중이에요…');

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        if (err && (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } catch (fallbackErr) {
            this._handleCameraError(fallbackErr, sessionId);
            return;
          }
        } else {
          this._handleCameraError(err, sessionId);
          return;
        }
      }

      // 비동기 대기 중 모달이 닫혔거나 탭이 전환되었다면 즉시 트랙 해제
      if (sessionId !== this._camSessionId || !this._isOpen || this._activeTab !== 'camera' || this._inResultView) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this._stream = stream;
      this.videoEl.srcObject = stream;
      this.videoEl.setAttribute('playsinline', '');
      this.videoEl.muted = true;

      try {
        await this.videoEl.play();
      } catch (_) {
        // 일부 모바일 브라우저 자동재생 지연 허용
      }

      if (sessionId !== this._camSessionId) {
        this._stopCamera();
        return;
      }

      this._setCameraStatus('카메라를 QR 코드에 비춰 주세요.');

      const ready = await this._prepareDecoder();
      if (sessionId !== this._camSessionId) return;
      if (!ready) {
        this._showCameraError('QR 인식 기능을 불러오지 못했어요. 아래에서 숫자 코드를 직접 입력해 주세요.');
        return;
      }

      this._lastScanTs = 0;
      const tick = async (ts) => {
        if (sessionId !== this._camSessionId || !this._isOpen || this._activeTab !== 'camera' || this._inResultView) {
          return;
        }
        if (ts - this._lastScanTs >= 110) {
          this._lastScanTs = ts;
          await this._scanVideoFrame(sessionId);
        }
        if (sessionId === this._camSessionId && this._isOpen && this._activeTab === 'camera' && !this._inResultView) {
          this._rafId = requestAnimationFrame(tick);
        }
      };
      this._rafId = requestAnimationFrame(tick);
    }

    _handleCameraError(err, sessionId) {
      if (sessionId !== this._camSessionId) return;
      const name = err && err.name ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this._showCameraError('카메라 권한이 거부되었어요. 브라우저 설정에서 허용하거나 아래에서 숫자 코드를 직접 입력해 주세요.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this._showCameraError('사용할 수 있는 카메라를 찾지 못했어요. 아래에서 숫자 코드를 직접 입력해 주세요.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        this._showCameraError('다른 앱에서 카메라를 사용 중이에요. 닫고 다시 시도하거나 숫자 코드를 입력해 주세요.');
      } else {
        this._showCameraError('카메라를 시작하지 못했어요. 다시 시도하거나 숫자 코드를 입력해 주세요.');
      }
    }

    _stopCamera() {
      this._camSessionId++;
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      if (this._stream) {
        try {
          this._stream.getTracks().forEach((track) => track.stop());
        } catch (_) {}
        this._stream = null;
      }
      if (this.videoEl) {
        try {
          this.videoEl.pause();
        } catch (_) {}
        this.videoEl.srcObject = null;
      }
    }

    async _prepareDecoder() {
      if (!this._detectorChecked) {
        this._detectorChecked = true;
        if ('BarcodeDetector' in window) {
          try {
            const formats = typeof window.BarcodeDetector.getSupportedFormats === 'function'
              ? await window.BarcodeDetector.getSupportedFormats()
              : ['qr_code'];
            if (Array.isArray(formats) && formats.includes('qr_code')) {
              this._detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            }
          } catch (_) {
            this._detector = null;
          }
        }
      }

      if (this._detector) return true;

      // BarcodeDetector 미지원 환경(iOS Safari, Firefox 등) → 로컬 vendor/jsQR.js 지연 로딩
      if (typeof window.jsQR === 'function') return true;
      if (!this._jsQrPromise) {
        this._jsQrPromise = new Promise((resolve) => {
          const existing = document.querySelector('script[src="vendor/jsQR.js"]');
          if (existing) {
            if (typeof window.jsQR === 'function') {
              resolve(true);
              return;
            }
            existing.addEventListener('load', () => resolve(typeof window.jsQR === 'function'));
            existing.addEventListener('error', () => resolve(false));
            return;
          }
          const script = document.createElement('script');
          script.src = 'vendor/jsQR.js';
          script.onload = () => resolve(typeof window.jsQR === 'function');
          script.onerror = () => resolve(false);
          document.head.appendChild(script);
        });
      }
      return this._jsQrPromise;
    }

    async _scanVideoFrame(sessionId) {
      const video = this.videoEl;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      let detectedRaw = null;
      const prefix = String(this.config.QR_PREFIX || 'CCDATE:');

      if (this._detector) {
        try {
          const codes = await this._detector.detect(video);
          if (sessionId !== this._camSessionId) return;
          if (Array.isArray(codes) && codes.length > 0) {
            const ours = codes.find((c) => c && typeof c.rawValue === 'string' && c.rawValue.trim().startsWith(prefix));
            const picked = ours || codes[0];
            if (picked && typeof picked.rawValue === 'string') {
              detectedRaw = picked.rawValue;
            }
          }
        } catch (_) {
          // 프레임 디코드 일시 오류 무시
        }
      } else if (typeof window.jsQR === 'function') {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(vw, vh));
        const cw = Math.max(1, Math.round(vw * scale));
        const ch = Math.max(1, Math.round(vh * scale));

        if (!this._offscreenCanvas) {
          this._offscreenCanvas = document.createElement('canvas');
          this._offscreenCtx = this._offscreenCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (this._offscreenCanvas.width !== cw || this._offscreenCanvas.height !== ch) {
          this._offscreenCanvas.width = cw;
          this._offscreenCanvas.height = ch;
        }
        this._offscreenCtx.drawImage(video, 0, 0, cw, ch);
        const imgData = this._offscreenCtx.getImageData(0, 0, cw, ch);
        const decoded = window.jsQR(imgData.data, cw, ch, { inversionAttempts: 'dontInvert' });
        if (decoded && typeof decoded.data === 'string' && decoded.data.length > 0) {
          detectedRaw = decoded.data;
        }
      }

      if (!detectedRaw || sessionId !== this._camSessionId) return;

      const now = Date.now();
      if (detectedRaw === this._lastDecodedRaw && now - this._lastDecodedTs < 1500) {
        return;
      }
      this._lastDecodedRaw = detectedRaw;
      this._lastDecodedTs = now;

      await this._handleResolvedInput(detectedRaw, 'camera');
    }

    // ─── 숫자 직접 입력 처리 ──────────────────────────────────────────────────

    _showInputError(msg) {
      if (this.inputErrorText) this.inputErrorText.textContent = msg;
      if (this.inputErrorBox) this.inputErrorBox.classList.remove('hidden');
    }

    _clearInputError() {
      if (this.inputErrorBox) this.inputErrorBox.classList.add('hidden');
      if (this.inputErrorText) this.inputErrorText.textContent = '';
    }

    async _submitManualCode() {
      const raw = this.codeInput ? this.codeInput.value : '';
      await this._handleResolvedInput(raw, 'manual');
    }

    // ─── 통합 결과 처리 (카메라 & 숫자 입력 공통) ─────────────────────────────

    async _handleResolvedInput(raw, source) {
      const entries = await this._ensureEntriesLoaded();
      const result = QrResolver.resolveCode(raw, {
        entries,
        config: this.config,
      });

      if (!result.ok) {
        if (source === 'camera') {
          this._setCameraStatus(result.message);
        } else {
          this._showInputError(result.message);
        }
        return;
      }

      // 성공: 카메라 즉시 중지, 짧은 진동(지원 시), 통합 결과 화면 표시
      this._stopCamera();
      if (source === 'camera' && navigator.vibrate) {
        try {
          navigator.vibrate(60);
        } catch (_) {}
      }

      this._showResult(result.entry, result.isNew);
    }

    _showResult(entry, isNew) {
      this._inResultView = true;
      this.mainView.classList.add('hidden');
      this.resultView.classList.remove('hidden');

      this.resultBadge.textContent = isNew ? '새로 확인한 코드' : '이미 확인한 코드예요.';
      this.resultBadge.classList.toggle('is-repeat', !isNew);
      this.resultTitle.textContent = entry.title || '';
      this.resultMessage.textContent = entry.message || '';

      if (entry.image) {
        this.resultImage.src = entry.image;
        this.resultImage.alt = entry.title || 'QR 코드 이미지';
        this.resultImageWrap.classList.remove('hidden');
      } else {
        this.resultImage.removeAttribute('src');
        this.resultImageWrap.classList.add('hidden');
      }

      requestAnimationFrame(() => {
        if (this._isOpen && this._inResultView) {
          this.resultOkBtn.focus();
        }
      });
    }
  }

  global.QrModal = QrModal;
})(typeof window !== 'undefined' ? window : globalThis);
