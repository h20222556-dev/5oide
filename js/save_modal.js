/**
 * save_modal.js — 디자인 가이드 기반 저장·불러오기 모달 컴포넌트
 * - 저장 모드("저장하기") / 불러오기 모드("불러오기") 공용
 * - 배경 키 + 스프라이트 키로 16:9 미리보기 합성 (이미지 캡처 미사용)
 * - 선택된 슬롯 강조, 빈 슬롯/이전 버전 슬롯 표시, 확인 팝업 연동
 * - 포커스 트랩(Tab 순환), 닫기 시 포커스 복귀, 바깥 클릭 닫기 방지
 */

'use strict';

class SaveModal {
  constructor({ saveManager, confirmPopup, getAssetManifest, resolveBackground, onSaveAction, onLoadAction, onDeleteAction, onClose }) {
    this.saveManager = saveManager;
    this.confirmPopup = confirmPopup;
    this.getAssetManifest = getAssetManifest || (() => null);
    this.resolveBackground = resolveBackground || null;
    this.onSaveAction = onSaveAction;
    this.onLoadAction = onLoadAction;
    this.onDeleteAction = onDeleteAction;
    this.onClose = onClose;

    this.modalEl = document.getElementById('modal-save');
    this.titleEl = document.getElementById('modal-save-title');
    this.slotsEl = document.getElementById('save-slots');
    this.closeBtn = document.getElementById('btn-close-save');

    this._isOpen = false;
    this._mode = 'save';
    this._selectedSlot = null;
    this._prevFocus = null;
    this._boundKeyDown = this._handleKeyDown.bind(this);
  }

  isOpen() {
    return this._isOpen;
  }

  open(mode = 'save') {
    if (!this.modalEl || !this.saveManager) return;
    this._mode = mode === 'load' ? 'load' : 'save';
    this._selectedSlot = null;
    this._prevFocus = document.activeElement;
    this._isOpen = true;

    if (this.titleEl) {
      this.titleEl.textContent = this._mode === 'save' ? '저장하기' : '불러오기';
    }

    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');
    this.modalEl.setAttribute('aria-labelledby', 'modal-save-title');

    this.render();
    this.modalEl.classList.remove('hidden');
    window.addEventListener('keydown', this._boundKeyDown, true);

    requestAnimationFrame(() => {
      if (this.closeBtn) this.closeBtn.focus();
    });
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    window.removeEventListener('keydown', this._boundKeyDown, true);
    if (this.modalEl) this.modalEl.classList.add('hidden');

    const prev = this._prevFocus;
    this._prevFocus = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      prev.focus();
    }

    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  render() {
    if (!this.slotsEl || !this.saveManager) return;
    const slots = this.saveManager.getAllSlots();
    const manifest = this.getAssetManifest();

    this.slotsEl.innerHTML = '';

    slots.forEach((slotData, idx) => {
      const slotNum = idx + 1;
      const numLabel = String(slotNum).padStart(2, '0');
      const isEmpty = !slotData;
      const isVersionMismatch = !isEmpty && !!slotData.isVersionMismatch;
      const isSelected = this._selectedSlot === slotNum;

      const card = document.createElement('div');
      card.className = [
        'vn-slot-card',
        isEmpty ? 'is-empty' : 'is-filled',
        isSelected ? 'is-selected' : '',
        isVersionMismatch ? 'is-version-mismatch' : '',
      ].filter(Boolean).join(' ');
      card.dataset.slot = String(slotNum);
      card.tabIndex = 0;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      const previewHtml = this._buildPreviewHtml(slotData, manifest);
      const infoHtml = this._buildInfoHtml(slotData, numLabel);
      const actionsHtml = this._buildActionsHtml(slotData, slotNum);

      card.innerHTML = `
        <div class="vn-slot-preview-wrap">
          <span class="vn-slot-badge">${numLabel}</span>
          ${previewHtml}
        </div>
        <div class="vn-slot-body">
          ${infoHtml}
          <div class="vn-slot-actions">
            ${actionsHtml}
          </div>
        </div>
      `;

      // 미리보기 이미지 로드 실패 시 연라벤더 그라데이션 + 장소명으로 대체
      const bgImg = card.querySelector('.vn-thumb-bg');
      if (bgImg) {
        bgImg.onerror = () => {
          const thumb = card.querySelector('.vn-slot-thumb');
          if (thumb) {
            const fallbackLabel = (slotData && (SaveManager.getPlaceName(slotData.bgKey) || slotData.chapterLabel)) || '저장된 데이터';
            thumb.innerHTML = `<div class="vn-thumb-fallback"><span>${fallbackLabel}</span></div>`;
          }
        };
      }
      card.querySelectorAll('.vn-thumb-sprite').forEach(imgEl => {
        imgEl.onerror = () => imgEl.remove();
      });

      // 카드 클릭/터치 시 선택 상태 토글 (한 번에 하나만)
      card.addEventListener('click', () => {
        this._selectSlot(slotNum);
      });
      card.addEventListener('keydown', (e) => {
        if (e.target === card && (e.code === 'Enter' || e.code === 'Space')) {
          e.preventDefault();
          this._selectSlot(slotNum);
        }
      });

      // 버튼 이벤트
      const saveBtn = card.querySelector('.vn-slot-btn-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectSlot(slotNum);
          this._confirmSave(slotNum, !isEmpty);
        });
      }

      const loadBtn = card.querySelector('.vn-slot-btn-load');
      if (loadBtn && !loadBtn.disabled) {
        loadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectSlot(slotNum);
          this._confirmLoad(slotNum);
        });
      }

      const delBtn = card.querySelector('.vn-slot-btn-delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectSlot(slotNum);
          this._confirmDelete(slotNum);
        });
      }

      this.slotsEl.appendChild(card);
    });
  }

  _selectSlot(slotNum) {
    this._selectedSlot = slotNum;
    if (!this.slotsEl) return;
    this.slotsEl.querySelectorAll('.vn-slot-card').forEach(el => {
      const selected = Number(el.dataset.slot) === slotNum;
      el.classList.toggle('is-selected', selected);
      el.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  _buildPreviewHtml(slotData, manifest) {
    if (!slotData) {
      return `
        <div class="vn-slot-thumb vn-slot-thumb-empty">
          <span class="vn-thumb-empty-text">비어 있음</span>
        </div>
      `;
    }

    const bgKey = slotData.bgKey;
    const gender = slotData.gender || 'female';
    const resolvedBg = (bgKey && bgKey !== 'bg_black' && typeof this.resolveBackground === 'function')
      ? this.resolveBackground(bgKey, gender)
      : null;
    const bgPath = resolvedBg || ((bgKey && bgKey !== 'bg_black' && manifest?.backgrounds?.[bgKey]) || null);
    const placeName = SaveManager.getPlaceName(bgKey);
    const fallbackText = placeName || slotData.chapterLabel || '저장된 데이터';

    if (!bgPath) {
      return `
        <div class="vn-slot-thumb">
          <div class="vn-thumb-fallback"><span>${fallbackText}</span></div>
        </div>
      `;
    }

    // 배경 위에 저장 당시 스프라이트 작게 합성
    const sprites = Array.isArray(slotData.spriteKeys) ? slotData.spriteKeys : [];
    const spriteImgs = sprites.map(sp => {
      const exprMap = manifest?.expressionMap?.[sp.id] || {};
      const mappedKey = sp.id === 'bokkeumbap' ? 'default' : (exprMap[sp.expression || '기본'] || 'default');
      const table = manifest?.characters?.[gender]?.[sp.id] || {};
      const src = table[mappedKey] || table.default || null;
      if (!src) return '';
      const posClass = sp.position === 'left' ? 'pos-left' : (sp.position === 'right' ? 'pos-right' : 'pos-center');
      return `<img class="vn-thumb-sprite ${posClass}" src="${src}" alt="">`;
    }).join('');

    return `
      <div class="vn-slot-thumb">
        <img class="vn-thumb-bg" src="${bgPath}" alt="${fallbackText}">
        ${spriteImgs}
      </div>
    `;
  }

  _buildInfoHtml(slotData, numLabel) {
    if (!slotData) {
      return `
        <div class="vn-slot-info">
          <div class="vn-slot-chapter is-empty-text">비어 있음</div>
          <div class="vn-slot-meta">슬롯 ${numLabel} · 저장된 데이터가 없습니다</div>
        </div>
      `;
    }

    const versionHtml = slotData.isVersionMismatch
      ? `<div class="vn-slot-warning">이전 버전의 저장 데이터입니다</div>`
      : '';

    return `
      <div class="vn-slot-info">
        <div class="vn-slot-chapter">${slotData.chapterLabel}</div>
        <div class="vn-slot-meta">${slotData.date}</div>
        ${versionHtml}
      </div>
    `;
  }

  _buildActionsHtml(slotData, slotNum) {
    const iconSave = `<svg class="vn-btn-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 3h9l3 3v11H4V3zm2 2v4h6V5H6zm0 7v3h8v-3H6z" fill="currentColor"/></svg>`;
    const iconLoad = `<svg class="vn-btn-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h4l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5v-9z" fill="currentColor"/></svg>`;
    const iconDelete = `<svg class="vn-btn-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 3h6l1 2h3v1.5H3V5h3l1-2zm-2 5h10l-.8 9H5.8L5 8z" fill="currentColor"/></svg>`;

    const isEmpty = !slotData;
    const isVersionMismatch = !isEmpty && !!slotData.isVersionMismatch;

    if (this._mode === 'save') {
      const saveLabel = isEmpty ? '저장' : '저장';
      const delHtml = !isEmpty
        ? `<button type="button" class="vn-btn vn-btn-secondary vn-slot-btn-delete" data-slot="${slotNum}">${iconDelete}<span>삭제</span></button>`
        : '';
      return `
        <button type="button" class="vn-btn vn-btn-primary vn-slot-btn-save" data-slot="${slotNum}">${iconSave}<span>${saveLabel}</span></button>
        ${delHtml}
      `;
    }

    // load mode
    const loadDisabled = isEmpty || isVersionMismatch;
    const delHtml = !isEmpty
      ? `<button type="button" class="vn-btn vn-btn-secondary vn-slot-btn-delete" data-slot="${slotNum}">${iconDelete}<span>삭제</span></button>`
      : '';
    return `
      <button type="button" class="vn-btn ${loadDisabled ? 'vn-btn-disabled' : 'vn-btn-primary'} vn-slot-btn-load" data-slot="${slotNum}" ${loadDisabled ? 'disabled' : ''}>${iconLoad}<span>불러오기</span></button>
      ${delHtml}
    `;
  }

  _confirmSave(slotNum, isOverwrite) {
    const message = isOverwrite
      ? '이미 저장된 데이터가 있습니다. 덮어쓰시겠습니까?'
      : '저장하시겠습니까?';

    this.confirmPopup.show({
      message,
      confirmLabel: '확인',
      cancelLabel: '취소',
      onConfirm: () => {
        if (typeof this.onSaveAction === 'function') {
          const ok = this.onSaveAction(slotNum);
          if (ok) {
            this.render();
            this._selectSlot(slotNum);
          } else {
            const errMsg = this.saveManager.lastError === 'quota'
              ? '저장 공간이 부족합니다. 다른 슬롯을 삭제한 뒤 다시 시도해 주세요.'
              : '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            this.confirmPopup.show({
              message: errMsg,
              confirmLabel: '확인',
              alertOnly: true,
            });
          }
        }
      },
    });
  }

  _confirmLoad(slotNum) {
    this.confirmPopup.show({
      message: '불러오시겠습니까?',
      confirmLabel: '확인',
      cancelLabel: '취소',
      onConfirm: () => {
        if (typeof this.onLoadAction === 'function') {
          const ok = this.onLoadAction(slotNum);
          if (ok) {
            this.close();
          }
        }
      },
    });
  }

  _confirmDelete(slotNum) {
    this.confirmPopup.show({
      message: '이 저장 데이터를 삭제하시겠습니까?',
      confirmLabel: '확인',
      cancelLabel: '취소',
      onConfirm: () => {
        if (typeof this.onDeleteAction === 'function') {
          this.onDeleteAction(slotNum);
        } else {
          this.saveManager.delete(slotNum);
        }
        this.render();
      },
    });
  }

  _getFocusableElements() {
    if (!this.modalEl) return [];
    return Array.from(
      this.modalEl.querySelectorAll('button:not(:disabled), [tabindex]:not([tabindex="-1"])')
    ).filter(el => el.offsetParent !== null);
  }

  _handleKeyDown(e) {
    if (!this._isOpen) return;
    // 확인 팝업이 열려 있으면 팝업이 키 이벤트를 처리함
    if (this.confirmPopup && this.confirmPopup.isOpen()) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
      return;
    }

    if (e.code === 'Tab') {
      const focusables = this._getFocusableElements();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !this.modalEl.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !this.modalEl.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
}
