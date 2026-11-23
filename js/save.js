/**
 * save.js — 세이브/로드 및 설정/기록실 관리자 (localStorage 기반)
 * - 기존 저장 키/구조 유지 + 메타 정보(savedAt, chapterLabel, bgKey, spriteKeys) 추가
 * - 메타 정보 없는 이전 저장 데이터 및 구 스토리 버전 호환 처리
 */

'use strict';

class SaveManager {
  constructor() {
    this.KEY_PREFIX = 'oidate_';
    this.SLOT_COUNT = 3;
    this.STORY_VERSION = 'v2_full_spec';
    this.lastError = null;
  }

  static get BG_PLACE_NAMES() {
    return {
      bg_legoland: '레고랜드',
      bg_skywalk: '소양강 스카이워크',
      bg_dakgalbi_alley: '명동 닭갈비 골목',
      bg_street_statue: '춘천 시내',
      bg_cafe: '카페',
      bg_pier: '춘천 선착장',
      bg_nami_boat_interior: '수상버스',
      bg_nami_entrance: '남이섬 선착장',
      bg_metasequoia_road: '메타세쿼이아길',
      bg_nami_riverside_walk: '호숫가 산책로',
      bg_ginkgo_road: '은행나무길',
      bg_hotel_morning: '숙소',
      bg_hotel_night: '숙소',
      bg_hotel: '숙소',
      bg_train_window: '열차 안',
      bg_phone_screen: '열차 안',
    };
  }

  static getPlaceName(bgKey) {
    if (!bgKey) return '';
    return SaveManager.BG_PLACE_NAMES[bgKey] || '';
  }

  static resolveChapterLabel(sceneId, bgKey) {
    const sid = String(sceneId || '');
    const place = SaveManager.getPlaceName(bgKey);

    if (sid === 's01_prologue') return '프롤로그';
    if (sid === 's02_place_select') return 'DAY 1 · 장소 선택';

    if (
      sid === 's03_lego' || sid === 's03_skywalk' || sid === 's03_myeongdong' ||
      sid === 's03_lego_phone' || sid === 's03_skywalk_phone' || sid === 's03_myeongdong_phone' ||
      sid === 's03_2_day1_messages'
    ) {
      let day1Place = place;
      if (!day1Place) {
        if (sid.includes('lego')) day1Place = '레고랜드';
        else if (sid.includes('skywalk')) day1Place = '소양강 스카이워크';
        else if (sid.includes('myeongdong')) day1Place = '명동 닭갈비 골목';
      }
      return day1Place ? `DAY 1 · ${day1Place}` : 'DAY 1 · 춘천';
    }

    if (sid === 's06_day1_end') return 'DAY 1 · 밤';

    if (sid === 's07_day2' || sid === 's07_dakgalbi' || sid === 's07_goguma' || sid === 's07_yangnyeom') {
      return place ? `DAY 2 · ${place}` : 'DAY 2 · 가까워지는 시간';
    }

    if (sid === 's08_day2_end') return 'DAY 2 · 밤';
    if (sid === 's09_pier') return 'DAY 3 · 춘천 선착장';
    if (sid.startsWith('s10_bus')) return 'DAY 3 · 수상버스';

    if (sid === 's11_dakgalbi' || sid === 's11_yangnyeom' || sid === 's11_goguma') {
      return place ? `DAY 3 · ${place}` : 'DAY 3 · 남이섬';
    }

    if (sid === 's11_return' || sid.startsWith('s12_')) return 'DAY 3 · 선택';
    if (sid.startsWith('ending_')) return '엔딩';

    return '플레이 중';
  }

  static formatSavedAt(isoOrMs) {
    if (!isoOrMs) return '저장 시각 정보 없음';
    const d = new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return '저장 시각 정보 없음';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
  }

  _slotKey(slot) {
    return `${this.KEY_PREFIX}save_${slot}`;
  }

  save(slot, gameState) {
    this.lastError = null;
    const now = Date.now();
    const savedAt = new Date(now).toISOString();
    const sceneId = gameState.sceneId ?? 's01_prologue';
    const bgKey = gameState.bgKey || null;
    const chapterLabel = gameState.chapterLabel || SaveManager.resolveChapterLabel(sceneId, bgKey);
    const spriteKeys = Array.isArray(gameState.spriteKeys)
      ? gameState.spriteKeys.map(s => ({
          id: s.id,
          expression: s.expression || '기본',
          position: s.position || 'center',
        }))
      : [];

    const data = {
      slot,
      timestamp: now,
      savedAt,
      chapterLabel,
      bgKey,
      spriteKeys,
      storyVersion: gameState.storyVersion || this.STORY_VERSION,
      gender: gameState.gender || 'female',
      playerName: gameState.playerName || '주인공',
      chapter: gameState.chapter ?? 1,
      sceneId,
      dialogueIndex: gameState.dialogueIndex ?? 0,
      affinity: { ...(gameState.affinity || {}) },
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
      const isQuota = err && (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
      );
      this.lastError = isQuota ? 'quota' : 'unknown';
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

  delete(slot) {
    try {
      localStorage.removeItem(this._slotKey(slot));
      return true;
    } catch (err) {
      console.warn('[SaveManager] 삭제 실패:', err);
      return false;
    }
  }

  listSlots() {
    return Array.from({ length: this.SLOT_COUNT }, (_, i) => {
      const slotNum = i + 1;
      const data = this.load(slotNum);
      if (!data) return null;

      const hasMeta = !!(data.savedAt || data.chapterLabel || data.bgKey);
      const chapterLabel = data.chapterLabel || '저장된 데이터';
      const dateStr = data.savedAt ? SaveManager.formatSavedAt(data.savedAt) : '저장 시각 정보 없음';
      const isVersionMismatch = data.storyVersion !== this.STORY_VERSION;

      return {
        slot: data.slot || slotNum,
        timestamp: data.timestamp || null,
        savedAt: data.savedAt || null,
        date: dateStr,
        chapterLabel,
        bgKey: data.bgKey || null,
        spriteKeys: Array.isArray(data.spriteKeys) ? data.spriteKeys : [],
        storyVersion: data.storyVersion || null,
        isVersionMismatch,
        isLegacyMeta: !hasMeta,
        playerName: data.playerName || '주인공',
        gender: data.gender || 'female',
        chapter: data.chapter ?? 1,
        sceneId: data.sceneId || null,
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
      return true;
    } catch (err) {
      console.warn('[SaveManager] 설정 저장 실패:', err);
      return false;
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
