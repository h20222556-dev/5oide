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
  }

  init(engine, renderer, saveManager, audioManager) {
    this.engine = engine;
    this.renderer = renderer;
    this.saveManager = saveManager;
    this.audioManager = audioManager;

    this._bindEvents();
    this.resizeGame();
  }

  setChoicesActive(active) {
    this._choicesActive = !!active;
  }

  _bindEvents() {
    // 1. 대사창 클릭
    const dialogueBox = document.getElementById('dialogue-box');
    if (dialogueBox) {
      dialogueBox.addEventListener('click', (e) => {
        this._handleAdvanceDialogue();
      });
    }

    // 2. 키보드 단축키
    window.addEventListener('keydown', (e) => {
      // 텍스트 인풋 포커스 중에는 핫키 무시
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'KeyD') {
        e.preventDefault();
        if (this.engine) this.engine.toggleDebug();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        this._closeAllModals();
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
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

    // 7. 창 크기 변경 시 16:9 비율 유지
    window.addEventListener('resize', () => this.resizeGame());
  }

  _handleAdvanceDialogue() {
    // 모달이 열려있거나 선택지가 떠 있으면 대사 넘김 차단
    if (this._saveModalOpen || this._settingsModalOpen || this._galleryModalOpen) return;
    if (this._choicesActive) return;

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

    // 배경 오버레이 클릭 시 닫기
    ['modal-save', 'modal-settings', 'modal-gallery'].forEach(id => {
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
    if (!this.saveManager || !this.renderer) return;
    this._saveModalOpen = true;
    const slots = this.saveManager.getAllSlots();

    this.renderer.showSaveModal(
      mode,
      slots,
      (slotNum) => {
        if (this.engine) {
          const state = this.engine.getState();
          this.saveManager.save(slotNum, state);
        }
        this._saveModalOpen = false;
      },
      (slotNum) => {
        const loaded = this.saveManager.load(slotNum);
        if (loaded && this.engine) {
          this.engine.loadState(loaded);
        }
        this._saveModalOpen = false;
      }
    );
  }

  closeSaveModal() {
    this._saveModalOpen = false;
    if (this.renderer) this.renderer.hideSaveModal();
  }

  openSettingsModal() {
    if (!this.renderer || !this.engine) return;
    this._settingsModalOpen = true;
    const curSettings = this.engine.getSettings();

    this.renderer.showSettingsModal(curSettings, (newSettings) => {
      this.engine.applySettings(newSettings);
      if (this.saveManager) this.saveManager.saveSettings(newSettings);
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

  // ─── 16:9 반응형 ───────────────────────────────────────────────────────────

  resizeGame() {
    const wrapper = document.getElementById('game-wrapper');
    if (!wrapper) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const targetRatio = 16 / 9;

    let w = winW;
    let h = winW / targetRatio;

    if (h > winH) {
      h = winH;
      w = winH * targetRatio;
    }

    wrapper.style.width = `${Math.floor(w)}px`;
    wrapper.style.height = `${Math.floor(h)}px`;
  }
}
