/**
 * save.js — 세이브/로드 및 설정/기록실 관리자 (localStorage 기반)
 */

'use strict';

class SaveManager {
  constructor() {
    this.KEY_PREFIX = 'oidate_';
    this.SLOT_COUNT = 3;
    this.STORY_VERSION = 'v2_full_spec';
  }

  _slotKey(slot) {
    return `${this.KEY_PREFIX}save_${slot}`;
  }

  save(slot, gameState) {
    const data = {
      slot,
      timestamp: Date.now(),
      storyVersion: gameState.storyVersion || this.STORY_VERSION,
      gender: gameState.gender || 'female',
      playerName: gameState.playerName || '주인공',
      chapter: gameState.chapter ?? 1,
      sceneId: gameState.sceneId ?? 's01_prologue',
      dialogueIndex: gameState.dialogueIndex ?? 0,
      affinity: { ...gameState.affinity },
      hiddenRoute: !!gameState.hiddenRoute,
      day1Visited: [...(gameState.day1Visited || [])],
      day2Visited: [...(gameState.day2Visited || [])],
      day2Target: gameState.day2Target || null,
      busChoice: gameState.busChoice || null,
      revealedSpeakers: Array.isArray(gameState.revealedSpeakers)
        ? gameState.revealedSpeakers
        : Array.from(gameState.revealedSpeakers || []),
      seenDialogues: Array.isArray(gameState.seenDialogues)
        ? gameState.seenDialogues
        : [...(gameState.seenDialogues ?? [])],
      settings: { ...(gameState.settings ?? {}) },
    };
    try {
      localStorage.setItem(this._slotKey(slot), JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('[SaveManager] 저장 실패:', err);
      return false;
    }
  }

  load(slot) {
    try {
      const raw = localStorage.getItem(this._slotKey(slot));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[SaveManager] 로드 실패:', err);
      return null;
    }
  }

  listSlots() {
    return Array.from({ length: this.SLOT_COUNT }, (_, i) => {
      const data = this.load(i + 1);
      if (!data) return null;
      const d = new Date(data.timestamp);
      const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return {
        slot: data.slot,
        timestamp: data.timestamp,
        date: dateStr,
        playerName: data.playerName,
        gender: data.gender,
        chapter: data.chapter,
        sceneId: data.sceneId,
      };
    });
  }

  getAllSlots() {
    return this.listSlots();
  }

  // ─── 설정 저장 / 로드 ──────────────────────────────────────────────────────────

  saveSettings(settings) {
    try {
      localStorage.setItem(`${this.KEY_PREFIX}settings`, JSON.stringify(settings));
    } catch (err) {
      console.warn('[SaveManager] 설정 저장 실패:', err);
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(`${this.KEY_PREFIX}settings`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[SaveManager] 설정 로드 실패:', err);
      return null;
    }
  }

  // ─── 기록실 (영구 달성 엔딩) ─────────────────────────────────────────────────

  saveGallery(galleryData) {
    try {
      localStorage.setItem(`${this.KEY_PREFIX}gallery`, JSON.stringify(galleryData));
    } catch (err) {
      console.warn('[SaveManager] 갤러리 저장 실패:', err);
    }
  }

  loadGallery() {
    try {
      const raw = localStorage.getItem(`${this.KEY_PREFIX}gallery`);
      if (!raw) return { endings: [] };
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[SaveManager] 갤러리 로드 실패:', err);
      return { endings: [] };
    }
  }

  loadAchievements() {
    const gallery = this.loadGallery();
    return new Set(gallery.endings || []);
  }

  addEndingToGallery(endingId) {
    const gallery = this.loadGallery();
    if (!gallery.endings) gallery.endings = [];
    if (!gallery.endings.includes(endingId)) {
      gallery.endings.push(endingId);
      this.saveGallery(gallery);
    }
  }
}
