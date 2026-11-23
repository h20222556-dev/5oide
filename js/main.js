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

  const btnNewGame = document.getElementById('btn-new-game');
  const btnLoad    = document.getElementById('btn-title-load');
  const setTitleReady = (ready) => {
    if (btnNewGame) {
      btnNewGame.disabled = !ready;
      btnNewGame.setAttribute('aria-disabled', ready ? 'false' : 'true');
      const fallbackEl = btnNewGame.querySelector('.title-btn-fallback');
      if (fallbackEl) {
        fallbackEl.textContent = ready ? (btnNewGame.dataset.readyLabel || '새로 시작') : '불러오는 중…';
      }
    }
    if (btnLoad) {
      btnLoad.disabled = !ready;
      btnLoad.setAttribute('aria-disabled', ready ? 'false' : 'true');
    }
  };

  // 로딩 중에는 시작 버튼을 명확히 비활성("불러오는 중…") 처리
  setTitleReady(false);

  // 2. 의존성 주입 및 이벤트 바인딩을 즉시 수행
  engine.setRenderer(renderer);
  engine.setUI(ui);
  engine.setSaveManager(save);
  engine.setAudioManager(audio);
  ui.init(engine, renderer, save, audio);
  ui.resizeGame();

  // 성별별 타이틀 배경 미리 불러오기
  renderer.preloadImage('assets/backgrounds/bg_title_f.png');
  renderer.preloadImage('assets/backgrounds/bg_title_m.png');

  // 첫 진입 시 검은 화면 위에 성별 선택 팝업 즉시 표시 -> 선택 후 1초 페이드 전환으로 타이틀 진입
  renderer.showScreen(null);
  renderer.showGenderModal((gender) => {
    engine.state.gender = gender;
    renderer.setTitleBackground(gender);
    renderer.showTitleWithFade();
  }, null, { initial: true });

  try {
    // 3. 엔진 데이터 병렬 로드 (config, manifest, characters, scenes)
    await engine.init();

    // 4. 저장된 설정 복원 및 적용
    const savedSettings = save.loadSettings();
    if (savedSettings) {
      engine.applySettings(savedSettings);
    } else {
      audio.setBgmVolume(engine.settings.bgmVolume);
      audio.setSfxVolume(engine.settings.sfxVolume);
    }

    // 5. 준비 완료 -> 즉시 시작 버튼 활성화
    setTitleReady(true);

  } catch (err) {
    console.error('[Main] 초기화 오류:', err);
    setTitleReady(true);
  }

  // 6. 개발자 디버그 및 콘솔 접근용 전역 객체
  window.game = { engine, renderer, ui, save, audio };
  console.log('[오이데] 미연시 엔진 초기화 완료. window.game 사용 가능. (D키: 디버그 모드)');
});
