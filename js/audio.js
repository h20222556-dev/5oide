/**
 * audio.js — 오디오 관리자
 */

'use strict';

class AudioManager {
  constructor() {
    /** @type {number} */
    this.bgmVolume = 0.5;
    /** @type {number} */
    this.sfxVolume = 0.7;
    /** @type {HTMLAudioElement|null} */
    this.currentBgm = null;
    /** @type {string|null} */
    this.bgmId = null;
  }

  /**
   * BGM / SFX 볼륨을 설정합니다.
   * @param {number} bgm  0.0 ~ 1.0
   * @param {number} sfx  0.0 ~ 1.0
   */
  setVolumes(bgm, sfx) {
    this.bgmVolume = bgm;
    this.sfxVolume = sfx;
    if (this.currentBgm) {
      this.currentBgm.volume = this.bgmVolume;
    }
  }

  /**
   * BGM을 재생합니다. 이미 같은 ID가 재생 중이면 무시합니다.
   * @param {string} id  assets/bgm/{id}.mp3
   */
  playBGM(id) {
    if (this.bgmId === id && this.currentBgm && !this.currentBgm.paused) return;

    // 기존 BGM 정지
    this.stopBGM();

    const audio = new Audio(`assets/bgm/${id}.mp3`);
    audio.loop = true;
    audio.volume = this.bgmVolume;
    audio.play().catch(err => {
      console.warn(`[AudioManager] BGM 재생 실패 (${id}):`, err);
    });

    this.currentBgm = audio;
    this.bgmId = id;
  }

  /**
   * 현재 BGM을 정지하고 초기화합니다.
   */
  stopBGM() {
    if (this.currentBgm) {
      try {
        this.currentBgm.pause();
        this.currentBgm.currentTime = 0;
      } catch (err) {
        console.warn('[AudioManager] BGM 정지 실패:', err);
      }
      this.currentBgm = null;
      this.bgmId = null;
    }
  }

  /**
   * SFX를 1회 재생합니다.
   * @param {string} id  assets/sfx/{id}.mp3
   */
  playSFX(id) {
    const audio = new Audio(`assets/sfx/${id}.mp3`);
    audio.volume = this.sfxVolume;
    audio.play().catch(err => {
      console.warn(`[AudioManager] SFX 재생 실패 (${id}):`, err);
    });
  }
}
