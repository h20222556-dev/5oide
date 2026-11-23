/**
 * ui.js — 사용자 인터랙션, 모달 및 디버그 이벤트 컨트롤러
 */

'use strict';

class UIController {
  constructor() {
    this.engine = null;
    this.renderer = null;
    this.saveManager = null;
    this.audioManager = null;

    this._choicesActive = false;
    this._saveModalOpen = false;
    this._settingsModalOpen = false;
    this._galleryModalOpen = false;
    this.confirmPopup = null;
    this.saveModal = null;
  }

  init(engine, renderer, saveManager, audioManager) {
    this.engine = engine;
    this.renderer = renderer;
    this.saveManager = saveManager;
    this.audioManager = audioManager;

    this.confirmPopup = typeof ConfirmPopup === 'function' ? new ConfirmPopup() : null;
    if (typeof SaveModal === 'function') {
      this.saveModal = new SaveModal({
        saveManager: this.saveManager,
        confirmPopup: this.confirmPopup,
        getAssetManifest: () => this.engine?.assetManifest || this.renderer?.assetManifest || null,
        onSaveAction: (slotNum) => {
          if (!this.engine || !this.saveManager) return false;
          const state = this.engine.getState();
          const ok = this.saveManager.save(slotNum, state);
          if (ok && this.renderer && typeof this.renderer.showToast === 'function') {
            this.renderer.showToast('저장되었습니다.');
          }
          return ok;
        },
        onLoadAction: (slotNum) => {
          if (!this.engine || !this.saveManager) return false;
          const loaded = this.saveManager.load(slotNum);
          if (!loaded) return false;
          if (loaded.storyVersion !== this.saveManager.STORY_VERSION) {
            if (this.confirmPopup) {
              this.confirmPopup.show({
                message: '이전 버전의 저장 데이터입니다. 불러올 수 없습니다.',
                confirmLabel: '확인',
                alertOnly: true,
              });
            }
            return false;
          }
          this.engine.loadState(loaded);
          return true;
        },
        onDeleteAction: (slotNum) => {
          if (this.saveManager) this.saveManager.delete(slotNum);
        },
        onClose: () => {
          this._saveModalOpen = false;
          if (this.engine && typeof this.engine.resumeFromModal === 'function') {
            this.engine.resumeFromModal();
          }
        },
      });
    }

    this._bindEvents();
    this.resizeGame();
  }

  setChoicesActive(active) {
    this._choicesActive = !!active;
  }

  _bindEvents() {
    // 1. 대사창 터치 및 클릭 (모바일 중복 탭 방지)
    const dialogueBox = document.getElementById('dialogue-box');
    if (dialogueBox) {
      let lastTouchTime = 0;
      dialogueBox.addEventListener('touchstart', (e) => {
        lastTouchTime = Date.now();
        this._handleAdvanceDialogue();
      }, { passive: true });

      dialogueBox.addEventListener('click', (e) => {
        // touchstart 직후 350ms 이내에 합성되는 click 이벤트 중복 실행 차단
        if (Date.now() - lastTouchTime < 350) return;
        this._handleAdvanceDialogue();
      });
    }

    // 2. 키보드 단축키
    window.addEventListener('keydown', (e) => {
      // 텍스트 인풋 포커스 중에는 핫키 무시 (단, Escape는 제외)
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.code === 'Escape') {
          e.preventDefault();
          const btnNameBack = document.getElementById('btn-name-back');
          if (btnNameBack) btnNameBack.click();
        }
        return;
      }

      if (e.code === 'KeyD') {
        e.preventDefault();
        if (this.engine) this.engine.toggleDebug();
        return;
      }

      if (e.code === 'Escape') {
        if (this.confirmPopup?.isOpen() || this.saveModal?.isOpen()) return;
        e.preventDefault();
        const nameModal = document.getElementById('modal-name');
        const genderModal = document.getElementById('modal-gender');

        if (nameModal && !nameModal.classList.contains('hidden')) {
          const btnBack = document.getElementById('btn-name-back');
          if (btnBack) { btnBack.click(); return; }
        }
        if (genderModal && !genderModal.classList.contains('hidden')) {
          const btnBack = document.getElementById('btn-gender-back');
          if (btnBack) { btnBack.click(); return; }
        }

        this._closeAllModals();
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        if (this.confirmPopup?.isOpen() || this._saveModalOpen || this._settingsModalOpen || this._galleryModalOpen) return;
        e.preventDefault();
        this._handleAdvanceDialogue();
      }
    });

    // 3. 상단 인게임 메뉴바
    this._bindMenuBar();

    // 4. 타이틀 화면 메뉴 버튼
    this._bindTitleButtons();

    // 5. 모달 닫기 버튼들
    this._bindModalCloseButtons();

    // 6. 디버그 장면 점프 버튼
    const btnDebugJump = document.getElementById('btn-debug-jump');
    const selectDebugScene = document.getElementById('debug-scene-select');
    if (btnDebugJump && selectDebugScene) {
      btnDebugJump.addEventListener('click', () => {
        const targetScene = selectDebugScene.value;
        if (targetScene && this.engine) {
          this.engine.jumpToScene(targetScene);
        }
      });
    }

    // 7. 창 크기 / 뷰포트 변경 시 반응형 재계산
    window.addEventListener('resize', () => this.resizeGame());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resizeGame());
      window.visualViewport.addEventListener('scroll', () => this.resizeGame());
    }
  }

  _handleAdvanceDialogue() {
    // 모달이 열려있거나 선택지가 떠 있거나 DAY 전환 중이면 대사 넘김 차단
    if (this._saveModalOpen || this._settingsModalOpen || this._galleryModalOpen) return;
    if (this._choicesActive || this.engine?.state?.isTransitioning) return;

    if (this.engine) {
      this.engine.nextDialogue();
    }
  }

  _bindMenuBar() {
    const bindBtn = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => {
        e.stopPropagation();
        handler();
      });
    };

    bindBtn('btn-save', () => this.openSaveModal('save'));
    bindBtn('btn-load', () => this.openSaveModal('load'));
    bindBtn('btn-settings', () => this.openSettingsModal());
    bindBtn('btn-to-title', () => {
      if (confirm('타이틀로 돌아가시겠습니까? 저장하지 않은 진행 상태는 사라집니다.')) {
        if (this.engine) this.engine.goToTitle();
      }
    });
    bindBtn('btn-auto', () => {
      if (this.engine) this.engine.toggleAuto();
    });
    bindBtn('btn-skip', () => {
      if (this.engine) this.engine.toggleSkip();
    });
  }

  _bindTitleButtons() {
    const bindBtn = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => {
        e.stopPropagation();
        handler();
      });
    };

    // 새로 시작: 성별 선택 -> 이름 입력 -> 프롤로그 시작 흐름 실행
    bindBtn('btn-new-game', () => {
      if (this.engine) this.engine.startNewGameFlow();
    });
    bindBtn('btn-title-load', () => this.openSaveModal('load'));
    bindBtn('btn-title-gallery', () => this.openGalleryModal());
    bindBtn('btn-title-settings', () => this.openSettingsModal());
  }

  _bindModalCloseButtons() {
    const bindClose = (btnId, closeFn) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFn();
      });
    };

    bindClose('btn-close-save', () => this.closeSaveModal());
    bindClose('btn-close-settings', () => this.closeSettingsModal());
    bindClose('btn-close-gallery', () => this.closeGalleryModal());

    // 배경 오버레이 클릭 시 닫기 (저장·불러오기 모달은 실수 닫기 방지를 위해 제외)
    ['modal-settings', 'modal-gallery'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this._closeAllModals();
        });
      }
    });
  }

  _closeAllModals() {
    this.closeSaveModal();
    this.closeSettingsModal();
    this.closeGalleryModal();
  }

  // ─── 모달 제어 ─────────────────────────────────────────────────────────────

  openSaveModal(mode) {
    if (!this.saveManager) return;
    if (this.engine && typeof this.engine.pauseForModal === 'function') {
      this.engine.pauseForModal();
    }
    this._saveModalOpen = true;
    if (this.saveModal) {
      this.saveModal.open(mode);
    }
  }

  closeSaveModal() {
    if (this.saveModal && this.saveModal.isOpen()) {
      this.saveModal.close();
    } else {
      this._saveModalOpen = false;
      if (this.renderer) this.renderer.hideSaveModal();
    }
  }

  openSettingsModal() {
    if (!this.renderer || !this.engine) return;
    this._settingsModalOpen = true;
    const curSettings = this.engine.getSettings();

    this.renderer.showSettingsModal(curSettings, (newSettings) => {
      this.engine.applySettings(newSettings);
      let ok = true;
      if (this.saveManager) ok = this.saveManager.saveSettings(newSettings) !== false;
      if (this.renderer && typeof this.renderer.showToast === 'function') {
        this.renderer.showToast(ok ? '설정이 저장되었습니다.' : '저장에 실패했습니다.');
      }
      this._settingsModalOpen = false;
    });
  }

  closeSettingsModal() {
    this._settingsModalOpen = false;
    if (this.renderer) this.renderer.hideSettingsModal();
  }

  openGalleryModal() {
    if (!this.renderer || !this.engine) return;
    this._galleryModalOpen = true;
    const { allEndings, achievedEndings } = this.engine.getGalleryData();
    this.renderer.showGalleryModal(allEndings, achievedEndings);
  }

  closeGalleryModal() {
    this._galleryModalOpen = false;
    if (this.renderer) this.renderer.hideGalleryModal();
  }

  // ─── 반응형 크기 조절 (PC 16:9 가로 유지 / 모바일 세로 100dvh 풀스크린) ────

  resizeGame() {
    const wrapper = document.getElementById('game-wrapper');
    if (!wrapper) return;

    const winW = window.innerWidth;
    const winH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

    const isPortrait = winW <= 768 || winW < winH;

    if (isPortrait) {
      wrapper.style.width = '100%';
      wrapper.style.height = `${winH}px`;
      wrapper.style.aspectRatio = 'unset';
    } else {
      const targetRatio = 16 / 9;
      let w = winW;
      let h = winW / targetRatio;

      if (h > winH) {
        h = winH;
        w = winH * targetRatio;
      }

      wrapper.style.width = `${Math.floor(w)}px`;
      wrapper.style.height = `${Math.floor(h)}px`;
      wrapper.style.aspectRatio = '16 / 9';
    }
  }
}
