/**
 * confirm_popup.js — 저장·불러오기·삭제 및 오류 안내용 공통 확인 팝업 컴포넌트
 * - 포커스 트랩 (Tab 순환) 및 닫힐 때 원래 위치로 포커스 복귀
 * - ESC = 취소(또는 알림 닫기), 바깥 영역 클릭으로 닫히지 않음
 */

'use strict';

class ConfirmPopup {
  constructor() {
    this._overlay = null;
    this._isOpen = false;
    this._prevFocus = null;
    this._onConfirm = null;
    this._onCancel = null;
    this._alertOnly = false;
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  isOpen() {
    return this._isOpen;
  }

  _ensureDom() {
    if (this._overlay) return;
    let el = document.getElementById('modal-confirm-popup');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-confirm-popup';
      el.className = 'vn-popup-overlay hidden';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'vn-confirm-message');
      el.innerHTML = `
        <div class="vn-popup-card">
          <p id="vn-confirm-message" class="vn-popup-message"></p>
          <div class="vn-popup-actions">
            <button type="button" class="vn-btn vn-btn-secondary" id="vn-confirm-cancel">취소</button>
            <button type="button" class="vn-btn vn-btn-primary" id="vn-confirm-ok">확인</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }
    this._overlay = el;
    this._msgEl = el.querySelector('#vn-confirm-message');
    this._okBtn = el.querySelector('#vn-confirm-ok');
    this._cancelBtn = el.querySelector('#vn-confirm-cancel');

    // 바깥 클릭 무시 (실수 닫기 방지 + 뒤 모달 조작 차단)
    this._overlay.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this._okBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = this._onConfirm;
      this.close();
      if (typeof cb === 'function') cb();
    });

    this._cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = this._onCancel;
      this.close();
      if (typeof cb === 'function') cb();
    });
  }

  show({
    message,
    confirmLabel = '확인',
    cancelLabel = '취소',
    alertOnly = false,
    onConfirm = null,
    onCancel = null,
  }) {
    this._ensureDom();
    this._prevFocus = document.activeElement;
    this._onConfirm = onConfirm;
    this._onCancel = onCancel;
    this._alertOnly = !!alertOnly;
    this._isOpen = true;

    this._msgEl.textContent = message || '';
    this._okBtn.textContent = confirmLabel;
    this._cancelBtn.textContent = cancelLabel;
    this._cancelBtn.classList.toggle('hidden', this._alertOnly);

    this._overlay.classList.remove('hidden');
    window.addEventListener('keydown', this._boundKeyDown, true);

    requestAnimationFrame(() => {
      if (this._alertOnly) {
        this._okBtn.focus();
      } else {
        this._okBtn.focus();
      }
    });
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    window.removeEventListener('keydown', this._boundKeyDown, true);
    if (this._overlay) this._overlay.classList.add('hidden');
    this._onConfirm = null;
    this._onCancel = null;

    const prev = this._prevFocus;
    this._prevFocus = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      prev.focus();
    }
  }

  _handleKeyDown(e) {
    if (!this._isOpen) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const cb = this._alertOnly ? this._onConfirm : this._onCancel;
      this.close();
      if (typeof cb === 'function') cb();
      return;
    }

    if (e.code === 'Tab') {
      const focusables = this._alertOnly
        ? [this._okBtn]
        : [this._cancelBtn, this._okBtn];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !this._overlay.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !this._overlay.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
}
