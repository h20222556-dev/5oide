/**
 * main.js
 * 애플리케이션 진입점 — 모듈 인스턴스 생성, 설정 로드, 시작 화면 표시
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 핵심 인스턴스 생성
  const engine   = new GameEngine();
  const renderer = new Renderer();
  const ui       = new UIController();
  const save     = new SaveManager();
  const audio    = new AudioManager();

  try {
    // 2. 엔진 데이터 로드 (config, characters, scenes)
    await engine.init();

    // 3. 상호 의존성 주입
    engine.setRenderer(renderer);
    engine.setUI(ui);
    engine.setSaveManager(save);
    engine.setAudioManager(audio);

    ui.init(engine, renderer, save, audio);

    // 4. 저장된 설정 복원 및 적용
    const savedSettings = save.loadSettings();
    if (savedSettings) {
      engine.applySettings(savedSettings);
    } else {
      audio.setBgmVolume(engine.settings.bgmVolume);
      audio.setSfxVolume(engine.settings.sfxVolume);
    }

    // 5. 타이틀 화면 표시 및 크기 초기화
    renderer.showScreen('title');
    ui.resizeGame();

  } catch (err) {
    console.error('[Main] 초기화 오류:', err);
    renderer.showScreen('title');
  }

  // 6. 개발자 디버그 및 콘솔 접근용 전역 객체
  window.game = { engine, renderer, ui, save, audio };
  console.log('[오이데] 미연시 엔진 초기화 완료. window.game 사용 가능. (D키: 디버그 모드)');
});
