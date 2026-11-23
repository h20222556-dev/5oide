/**
 * engine.js — 게임 핵심 상태 머신, 이름/조사 변환, 엔딩/히든 판정 및 장면 처리기
 */

'use strict';

class GameEngine {
  constructor() {
    // ─── 게임 상태 ────────────────────────────────────────────────────────────
    this.state = {
      gender: 'female',            // 'female' 또는 'male'
      playerName: '주인공',
      sceneId: null,
      dialogueIndex: 0,
      chapter: 1,

      affinity: { dakgalbi: 0, yangnyeom: 0, goguma: 0 },

      hiddenRoute: false,          // #12 판정 결과 (세 명 모두 < 8일 때 true)
      revealedSpeakers: new Set(), // 실제 이름이 밝혀진 캐릭터 목록

      day1Visited: [],             // Day 1 방문한 장소 목록 ['lego', 'skywalk', ...]
      day2Visited: [],             // Day 2 만난 캐릭터 목록 ['dakgalbi', 'goguma', ...]
      day2Target: null,            // Day 2 선택한 캐릭터
      busChoice: null,             // #10에서 고른 좌석 ('dakgalbi' | 'yangnyeom' | 'goguma')

      seenDialogues: new Set(),
      isAuto: false,
      isSkip: false,
      isTyping: false,
      choiceActive: false,
      debugMode: false,
    };

    // ─── 데이터 저장소 ─────────────────────────────────────────────────────────
    this.scenes = new Map();
    this.charactersAll = null;    // { female: {...}, male: {...} }
    this.config = null;
    this.scoreScale = null;
    this.assetManifest = null;

    this.settings = {
      textSpeed: 40,
      autoSpeed: 2000,
      skipSpeed: 25,
      bgmVolume: 0.5,
      sfxVolume: 0.7,
      showAffinity: true,
    };

    // ─── 의존 객체 ───────────────────────────────────────────────────────────
    this.renderer = null;
    this.ui = null;
    this.saveManager = null;
    this.audioManager = null;

    this._autoTimer = null;
  }

  get isAuto() { return this.state.isAuto; }
  get isSkip() { return this.state.isSkip; }

  // 현재 성별에 따른 캐릭터 정보 맵 반환
  get currentCharacters() {
    if (!this.charactersAll) return {};
    return this.charactersAll[this.state.gender] || this.charactersAll['female'];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 초기화 및 의존성 주입
  // ════════════════════════════════════════════════════════════════════════════

  setRenderer(renderer) {
    this.renderer = renderer;
    if (this.renderer) {
      if (this.assetManifest && typeof this.renderer.setAssetManifest === 'function') {
        this.renderer.setAssetManifest(this.assetManifest);
      }
      if (this.config?.dayTransition) this.renderer.dayTransitionConfig = this.config.dayTransition;
      if (this.config?.TRANSITION_MODE) this.renderer.transitionMode = this.config.TRANSITION_MODE;
      if (this.config) this.renderer.showChoiceImages = this.config.SHOW_CHOICE_IMAGES === true;
      if (this.config && typeof this.renderer.setHudVisible === 'function') {
        this.renderer.setHudVisible(this.config.SHOW_HUD === true);
      }
    }
  }
  setUI(ui) { this.ui = ui; }
  setSaveManager(save) { this.saveManager = save; }
  setAudioManager(audio) { this.audioManager = audio; }
  setAchievedEndings() {}

  async init() {
    // 1. config 및 에셋 매니페스트 병렬 로드
    const [cfg, scale, chars, manifest] = await Promise.all([
      loadJSON('config/game_config.json'),
      loadJSON('config/score_scale.json'),
      loadJSON('config/characters.json'),
      loadJSON('config/assets_manifest.json').catch(err => {
        console.warn('[GameEngine] assets_manifest.json 로드 실패:', err);
        return null;
      }),
    ]);
    this.config = cfg;
    this.scoreScale = scale;
    this.charactersAll = chars;
    this.assetManifest = manifest;

    if (this.renderer) {
      if (this.assetManifest && typeof this.renderer.setAssetManifest === 'function') {
        this.renderer.setAssetManifest(this.assetManifest);
      }
      if (this.config.dayTransition) this.renderer.dayTransitionConfig = this.config.dayTransition;
      if (this.config.TRANSITION_MODE) this.renderer.transitionMode = this.config.TRANSITION_MODE;
      this.renderer.showChoiceImages = this.config.SHOW_CHOICE_IMAGES === true;
      if (typeof document !== 'undefined' && document.documentElement) {
        if (this.config.PHONE_ASPECT_WIDTH) document.documentElement.style.setProperty('--phone-aspect-w', String(this.config.PHONE_ASPECT_WIDTH));
        if (this.config.PHONE_ASPECT_HEIGHT) document.documentElement.style.setProperty('--phone-aspect-h', String(this.config.PHONE_ASPECT_HEIGHT));
      }
      if (typeof this.renderer.setHudVisible === 'function') {
        this.renderer.setHudVisible(this.config.SHOW_HUD === true);
      }
    }

    // 2. 모든 씬 파일 병렬 로드 (초기 접속 시 시작 버튼 대기 시간 최소화)
    const sceneFiles = this.config.sceneFiles || [];
    const loadedScenes = await Promise.all(
      sceneFiles.map(file =>
        loadJSON(`data/scenes/${file}`).catch(err => {
          console.warn(`[GameEngine] 씬 로드 실패 (${file}):`, err);
          return null;
        })
      )
    );
    for (const scene of loadedScenes) {
      if (scene && scene.id) {
        this.scenes.set(scene.id, scene);
      }
    }

    // 3. 설정값 반영
    this.settings.textSpeed = this.config.textSpeed ?? 40;
    this.settings.autoSpeed = this.config.autoSpeed ?? 2000;
    this.settings.skipSpeed = this.config.skipSpeed ?? 25;
    this.settings.bgmVolume = this.config.bgmVolume ?? 0.5;
    this.settings.sfxVolume = this.config.sfxVolume ?? 0.7;
    this.settings.showAffinity = this.config.showAffinity !== false;

    // 4. 프롤로그 및 초반 장면 배경 백그라운드 프리로드 (시작 버튼 비차단)
    if (this.renderer && typeof this.renderer.preloadBackground === 'function') {
      ['bg_train_window', 'bg_phone_screen', 'bg_brochure', 'bg_legoland', 'bg_skywalk', 'bg_dakgalbi_alley'].forEach(bg => {
        this.renderer.preloadBackground(bg, null, this.state.gender);
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 게임 시작 흐름 (성별 선택 -> 이름 입력 -> 프롤로그)
  // ════════════════════════════════════════════════════════════════════════════

  startNewGameFlow() {
    if (!this.renderer) return;

    let selectedGender = this.state.gender || 'female';
    let typedName = this.state.playerName && this.state.playerName !== '주인공' ? this.state.playerName : '';

    const showGenderStep = () => {
      this.renderer.showGenderModal(
        (gender) => {
          selectedGender = gender;
          this.state.gender = gender;
          showNameStep();
        },
        () => {
          // 성별 선택 단계에서 "뒤로" -> 타이틀 메뉴로 복귀
          this.renderer.showScreen('title');
        }
      );
    };

    const showNameStep = () => {
      this.renderer.showNameModal(
        (enteredName) => {
          this.state.playerName = enteredName.trim() || '주인공';
          this.state.gender = selectedGender;
          this._initNewGameState();
          this.renderer.showScreen('game');
          this._runDayTransition(1, "춘천에서의 첫 만남", 's01_prologue');
        },
        (currentInput) => {
          // 이름 입력 단계에서 "뒤로" -> 성별 선택 복귀 (입력하던 이름 유지)
          typedName = currentInput;
          showGenderStep();
        },
        typedName
      );
    };

    showGenderStep();
  }

  _initNewGameState() {
    this.state.affinity = { dakgalbi: 0, yangnyeom: 0, goguma: 0 };
    this.state.hiddenRoute = false;
    this.state.revealedSpeakers = new Set();
    this.state.day1Visited = [];
    this.state.day2Visited = [];
    this.state.day2Target = null;
    this.state.busChoice = null;

    this.state.dialogueIndex = 0;
    this.state.isAuto = false;
    this.state.isSkip = false;
    this.state.isTyping = false;
    this.state.choiceActive = false;
    this._stopAutoTimer();

    if (this.renderer) {
      this.renderer.updateMenuBar(false, false);
      this.renderer.updateAffinityBar(this.state.affinity, this.currentCharacters, this.settings.showAffinity);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  goToTitle() {
    this._stopAutoTimer();
    this.state.isAuto = false;
    this.state.isSkip = false;
    this.state.isTyping = false;
    this.state.choiceActive = false;

    if (this.audioManager) this.audioManager.stopBGM();
    if (this.renderer) {
      this.renderer.hideChoices();
      this.renderer.hidePhoneMessages();
      if (typeof this.renderer.hideChatList === 'function') this.renderer.hideChatList();
      if (typeof this.renderer.hidePromoBillboard === 'function') this.renderer.hidePromoBillboard();
      this.renderer.showScreen('title');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 세이브 / 로드 연동 상태 관리
  // ════════════════════════════════════════════════════════════════════════════

  getState() {
    return {
      storyVersion: this.config?.storyVersion || 'v2_full_spec',
      gender: this.state.gender,
      playerName: this.state.playerName,
      chapter: this.state.chapter,
      sceneId: this.state.sceneId === '__followup__' ? (this._followOrigId || 's01_prologue') : this.state.sceneId,
      dialogueIndex: this.state.sceneId === '__followup__' ? 0 : this.state.dialogueIndex,
      affinity: { ...this.state.affinity },
      hiddenRoute: this.state.hiddenRoute,
      revealedSpeakers: Array.from(this.state.revealedSpeakers),
      day1Visited: [...this.state.day1Visited],
      day2Visited: [...this.state.day2Visited],
      day2Target: this.state.day2Target,
      busChoice: this.state.busChoice,
      seenDialogues: [...this.state.seenDialogues],
      settings: { ...this.settings },
    };
  }

  loadState(saved) {
    if (!saved) return false;
    const expectedVer = this.config?.storyVersion || 'v2_full_spec';
    if (saved.storyVersion !== expectedVer) {
      if (typeof alert === 'function') {
        alert('이전 스토리 버전의 저장 데이터라 불러올 수 없습니다. 새로 시작해 주세요.');
      }
      return false;
    }
    this._stopAutoTimer();

    this.state.gender = saved.gender || 'female';
    this.state.playerName = saved.playerName || '주인공';
    this.state.chapter = saved.chapter || 1;
    this.state.affinity = { ...(saved.affinity || { dakgalbi: 0, yangnyeom: 0, goguma: 0 }) };
    this.state.hiddenRoute = !!saved.hiddenRoute;
    this.state.revealedSpeakers = new Set(saved.revealedSpeakers || []);
    this.state.day1Visited = [...(saved.day1Visited || [])];
    this.state.day2Visited = [...(saved.day2Visited || [])];
    this.state.day2Target = saved.day2Target || null;
    this.state.busChoice = saved.busChoice || null;

    this.state.seenDialogues = new Set(saved.seenDialogues || []);
    this.state.dialogueIndex = saved.dialogueIndex || 0;
    this.state.isAuto = false;
    this.state.isSkip = false;
    this.state.isTyping = false;
    this.state.choiceActive = false;
    this.state.isTransitioning = false;

    if (this.renderer && typeof this.renderer.clearDayTransition === 'function') {
      this.renderer.clearDayTransition();
    }

    if (saved.settings) {
      this.applySettings(saved.settings);
    }

    if (this.renderer) {
      this.renderer.showScreen('game');
      this.renderer.updateMenuBar(false, false);
      this.renderer.updateAffinityBar(this.state.affinity, this.currentCharacters, this.settings.showAffinity);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }

    this.goToScene(saved.sceneId || 's01_prologue', this.state.dialogueIndex);
  }

  getSettings() { return { ...this.settings }; }

  applySettings(newSettings) {
    if (!newSettings) return;
    this.settings = { ...this.settings, ...newSettings };
    if (this.audioManager) {
      if (this.settings.bgmVolume !== undefined) this.audioManager.setBgmVolume(this.settings.bgmVolume);
      if (this.settings.sfxVolume !== undefined) this.audioManager.setSfxVolume(this.settings.sfxVolume);
    }
    if (this.renderer) {
      const curScene = this.scenes.get(this.state.sceneId);
      const allowHud = !(curScene && curScene.day === 3) && this.settings.showAffinity;
      this.renderer.updateAffinityBar(this.state.affinity, this.currentCharacters, allowHud);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 씬 및 대사 렌더링
  // ════════════════════════════════════════════════════════════════════════════

  goToScene(sceneId, startDialogueIndex = 0) {
    if (sceneId === '__TITLE__') {
      this.goToTitle();
      return;
    }

    const scene = this.scenes.get(sceneId);
    if (!scene) {
      console.warn(`[GameEngine] 존재하지 않는 씬 ID: ${sceneId}`);
      return;
    }

    this.state.sceneId = sceneId;
    this.state.dialogueIndex = startDialogueIndex;
    this.state.choiceActive = false;
    if (sceneId !== '__followup__') this._inlineChoice = null;
    this._stopAutoTimer();

    if (this.ui) this.ui.setChoicesActive(false);
    if (this.renderer) {
      this.renderer.hideChoices();
      this.renderer.hidePhoneMessages();
      if (typeof this.renderer.hideChatList === 'function') this.renderer.hideChatList();
      if (typeof this.renderer.hidePromoBillboard === 'function') this.renderer.hidePromoBillboard();
      this.renderer.setBackground(scene.background, scene.overlay || null, this.state.gender);
      this.renderer.setTime(scene.time);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
      if (typeof this.renderer.showCG === 'function') this.renderer.showCG(null);
      if (typeof this.renderer.setAffinityVisible === 'function') {
        this.renderer.setAffinityVisible(this.config?.SHOW_HUD === true && this.settings.showAffinity !== false);
      }
      // 현재 씬 및 다음 씬의 배경·캐릭터 스프라이트 프리로드 (전환/표정 교체 깜빡임 방지)
      if (typeof this.renderer.preloadCharacterSprites === 'function') {
        this.renderer.preloadCharacterSprites(this.state.gender);
      }
      if (typeof this.renderer.preloadBackground === 'function') {
        const preloadSceneBgs = (sc) => {
          if (!sc) return;
          this.renderer.preloadBackground(sc.background, sc.overlay || null, this.state.gender);
          (sc.dialogues || []).forEach(d => {
            if (d && d.background) this.renderer.preloadBackground(d.background, d.overlay || null, this.state.gender);
          });
        };
        preloadSceneBgs(scene);
        if (scene.next) preloadSceneBgs(this.scenes.get(scene.next));
      }
    }

    if (this.audioManager && scene.bgm) {
      this.audioManager.playBGM(scene.bgm);
    }

    // 특수 씬 진입 처리 (Day 1 방문 기록 — 중복 방지)
    if (sceneId === 's03_lego' && !this.state.day1Visited.includes('lego')) this.state.day1Visited.push('lego');
    else if (sceneId === 's03_skywalk' && !this.state.day1Visited.includes('skywalk')) this.state.day1Visited.push('skywalk');
    else if (sceneId === 's03_myeongdong' && !this.state.day1Visited.includes('myeongdong')) this.state.day1Visited.push('myeongdong');

    // 엔딩 씬이면 갤러리 등록
    if (scene.type === 'ending') {
      if (this.saveManager) {
        this.saveManager.addEndingToGallery(scene.id);
      }
    }

    this._renderCurrentDialogue();
  }

  _renderCurrentDialogue() {
    const scene = this.scenes.get(this.state.sceneId);
    if (!scene) return;

    // 휴대폰 메시지 장면 (phone_message 타입) 특수 처리
    if (scene.type === 'phone_message') {
      this._renderPhoneMessageScene(scene);
      return;
    }

    const dialogues = scene.dialogues || [];

    // 조건부 대사 (볶음밥 등장 상태에서만 나오는 대사)
    while (this.state.dialogueIndex < dialogues.length && dialogues[this.state.dialogueIndex].onlyIf === 'hidden' && !this.state.hiddenUnlocked) {
      this.state.dialogueIndex++;
    }

    // 대사 목록 끝 도달
    if (this.state.dialogueIndex >= dialogues.length) {
      this._onDialoguesFinished(scene);
      return;
    }

    const d = dialogues[this.state.dialogueIndex];
    // 인라인 선택지 (대사 흐름 중간에 표시 -> 고른 응답만 재생 -> 합류/공통 대사로 계속)
    if (d && d.type === 'choice') {
      this._inlineChoice = { sceneId: this.state.sceneId, nextIndex: this.state.dialogueIndex + 1 };
      this._presentChoices(d.question, d.options);
      return;
    }

    const dKey = `${this.state.sceneId}__${this.state.dialogueIndex}`;
    const alreadySeen = this.state.seenDialogues.has(dKey);
    this.state.seenDialogues.add(dKey);
    if (d.reveal) this.state.revealedSpeakers.add(d.reveal);

    // 텍스트 변수 및 조사 치환 (현재 성별에 맞는 캐릭터 이름 전달)
    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || (this.state.gender === 'male' ? '다고길' : '다곡희'),
      양념: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      yangnyeom: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      고구마: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      goguma: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      볶음밥: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
    };

    let processedText = resolveTextVariables(d.text, vars);

    // 실제 이름 공개 여부 판별 (← 이 대사부터 화자 이름이 ???에서 실제 이름으로 바뀜)
    // (a) 안내 지문이 있거나 자기소개 대사 감지
    const hasRevealNotice = d.text.includes('실제 이름으로 바뀜') || (d.text.includes('제 이름은') && d.speaker?.includes('고구마'));
    if (hasRevealNotice) {
      if (d.speaker?.includes('닭갈비')) this.state.revealedSpeakers.add('dakgalbi');
      if (d.speaker?.includes('고구마')) this.state.revealedSpeakers.add('goguma');
      if (d.speaker?.includes('양념')) this.state.revealedSpeakers.add('yangnyeom');
    }

    // (b) 화자 라벨이 실제 이름(또는 역할)으로 지정되어 있고 "???"가 아닌 경우 (speakerId로 명시 제어되는 화자 제외)
    if (!d.speakerId) {
      for (const [cid, cData] of Object.entries(this.currentCharacters)) {
        if (d.speaker && (d.speaker.includes(cData.role) || d.speaker.includes(cData.name)) && !d.speaker.includes('???')) {
          if (!['s03_lego', 's03_skywalk', 's03_myeongdong'].includes(this.state.sceneId)) {
            this.state.revealedSpeakers.add(cid);
          } else if (hasRevealNotice || d.text.includes('제 이름은') || d.text.includes('입니다') || d.text.includes('이요')) {
            this.state.revealedSpeakers.add(cid);
          }
        }
      }
    }

    // 안내 지문 제거
    if (processedText.includes('실제 이름으로 바뀜')) {
      processedText = processedText.replace(/\(←\s*이 대사부터[^\)]+\)/g, '').trim();
    }

    // 화자 이름 및 고유 이름 색 결정 (모든 화자 서로 구분, 주인공 기준색 #FF9ECD 유지)
    const EXTRA_SPEAKER_COLORS = {
      '주인공': '#FF9ECD',
      '안내방송': '#74C0FC',
      '관광객': '#8CE99A',
      '???': '#CED4DA',
    };
    let speakerDisplayName = d.speaker;
    let speakerColor = null;

    if (d.speaker === '???') {
      speakerDisplayName = '???';
      speakerColor = EXTRA_SPEAKER_COLORS['???'];
    } else if (d.speaker) {
      if (d.speaker.includes('나레이션') || d.speaker.includes('내레이션') || d.speakerType === 'narration') {
        speakerDisplayName = null;
      } else if (d.speaker.includes('{')) {
        speakerDisplayName = resolveTextVariables(d.speaker, vars);
        speakerColor = EXTRA_SPEAKER_COLORS['???'];
      } else {
        let cleanSpeaker = d.speaker.replace(/\(V\.O\.\)|\(O\.S\.\)|\(속마음\)|\(화면\s*밖\)|\[화면\s*밖\]/g, '').trim();
        let matched = false;
        for (const [cid, cData] of Object.entries(this.currentCharacters)) {
          if (cleanSpeaker.includes(cData.role) || cleanSpeaker.includes(cid) || cleanSpeaker.includes(cData.name)) {
            matched = true;
            speakerDisplayName = cData.name || (typeof getDisplayName === 'function' ? getDisplayName(cid, this.state.gender) : cData.role);
            speakerColor = cData.color;
            if (cleanSpeaker.startsWith('영상 속')) speakerDisplayName = '영상 속 ' + speakerDisplayName;
            break;
          }
        }
        if (!matched) {
          if (cleanSpeaker === '주인공') {
            speakerDisplayName = this.state.playerName;
            speakerColor = EXTRA_SPEAKER_COLORS['주인공'];
          } else if (cleanSpeaker.includes('안내방송')) {
            speakerColor = EXTRA_SPEAKER_COLORS['안내방송'];
          } else if (cleanSpeaker.includes('관광객')) {
            speakerColor = EXTRA_SPEAKER_COLORS['관광객'];
          }
        }
      }
    }

    if (this.renderer) {
      if (d.background) {
        this.renderer.setBackground(d.background, d.overlay || null, this.state.gender);
      }
      if (typeof this.renderer.showChatList === 'function') {
        if (d.chatList) {
          this.renderer.showChatList(d.chatList, {
            gender: this.state.gender,
            playerName: this.state.playerName,
            day1Visited: this.state.day1Visited,
            charactersMap: this.currentCharacters,
            vars,
          });
        } else {
          this.renderer.hideChatList();
        }
      }
      this.renderer.setSpeaker(speakerDisplayName, speakerColor, d.speakerType);
      if (typeof this.renderer.showCG === 'function') this.renderer.showCG(d.cg || null);
      this.renderer.setDialogueStyle(d.speakerType, !!d.textLarge);
      this.renderer.setCharacters(d.characters, d.speaker, this.state.gender, this.currentCharacters);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }

    // 스킵 모드 + 이미 본 대사 -> 타이핑 없이 즉시 넘김
    if (this.state.isSkip && alreadySeen) {
      this.state.isTyping = false;
      if (this.renderer) {
        this.renderer.startTyping(processedText, 0, () => {
          this._scheduleNext(this.settings.skipSpeed || 25);
        });
      }
      return;
    }

    // 일반 타이핑
    this.state.isTyping = true;
    const speed = this.settings.textSpeed ?? 40;

    if (this.renderer) {
      this.renderer.startTyping(processedText, speed, () => {
        this.state.isTyping = false;
        if (this.state.isAuto) {
          this._scheduleNext(this.settings.autoSpeed || 2000);
        }
      });
    }
  }

  // ─── 휴대폰 메시지 전용 렌더링 (V.O. 2줄 -> 말풍선 팝업 -> V.O. 1줄 -> 다음 씬) ───
  _renderPhoneMessageScene(scene) {
    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || (this.state.gender === 'male' ? '다고길' : '다곡희'),
      양념: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      yangnyeom: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      고구마: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      goguma: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      볶음밥: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
    };

    const idx = this.state.dialogueIndex;
    if (idx === 0 || idx === 1) {
      // V.O. 2줄 ("생각보다 정말 재미있는 곳이었어.", "그리고 예상하지 못한 만남까지...")
      const defaultIntros = ["생각보다 정말 재미있는 곳이었어.", "그리고 예상하지 못한 만남까지..."];
      const rawText = scene.intro_vo && scene.intro_vo[idx] ? scene.intro_vo[idx] : defaultIntros[idx];
      const text = resolveTextVariables(rawText, vars);
      if (this.renderer) {
        this.renderer.setSpeaker(this.state.playerName, null, 'vo');
        this.renderer.setDialogueStyle('vo');
        this.renderer.setCharacters([], null, this.state.gender);
        this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
        this.state.isTyping = true;
        this.renderer.startTyping(text, this.settings.textSpeed ?? 40, () => {
          this.state.isTyping = false;
          if (this.state.isAuto) this._scheduleNext(this.settings.autoSpeed || 2000);
        });
      }
    } else if (idx === 2) {
      // 휴대폰 말풍선 화면 열기
      this._stopAutoTimer();
      const partnerData = this.currentCharacters[scene.partner];
      const partnerName = partnerData ? partnerData.name : '연락처';
      const partnerColor = partnerData?.color || '#FF9ECD';

      const resolvedMsgs = (scene.messages || []).map(m => ({
        sender: m.sender,
        senderName: m.sender === 'player' ? this.state.playerName : partnerName,
        senderColor: m.sender === 'player' ? '#FF9ECD' : partnerColor,
        text: resolveTextVariables(m.text, vars)
      }));

      if (this.renderer) {
        this.renderer.startPhoneMessageSequence(partnerName, resolvedMsgs, () => {
          // 말풍선 완료 후 outro VO 대사로 진행
          this.state.dialogueIndex = 3;
          this._renderCurrentDialogue();
        }, partnerColor);
      } else {
        this.state.dialogueIndex = 3;
        this._renderCurrentDialogue();
      }
    } else if (idx === 3) {
      // 그 세트의 마지막 V.O. 한 줄 ("답장이 정말 빠르네!" 등)
      const rawText = scene.outro_vo || "답장이 정말 빠르네!";
      const text = resolveTextVariables(rawText, vars);
      if (this.renderer) {
        this.renderer.setSpeaker(this.state.playerName, null, 'vo');
        this.renderer.setDialogueStyle('vo');
        this.renderer.setCharacters([], null, this.state.gender);
        this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
        this.state.isTyping = true;
        this.renderer.startTyping(text, this.settings.textSpeed ?? 40, () => {
          this.state.isTyping = false;
          if (this.state.isAuto) this._scheduleNext(this.settings.autoSpeed || 2000);
        });
      }
    } else {
      // 세 번째(마지막) 장소 방문 완료 시 "다음 장소로 이동해 볼까?"(s03_2)를 건너뛰고 바로 Day 1 마무리로 이동
      if (this.state.day1Visited.length >= 3) {
        this.goToScene('s06_day1_end');
      } else {
        this.goToScene(scene.next || 's03_2_day1_messages');
      }
    }
  }

  nextDialogue() {
    if (this.state.choiceActive || this.state.isTransitioning) return;

    const scene = this.scenes.get(this.state.sceneId);
    if (scene && scene.type === 'phone_message') {
      if (this.state.isTyping) {
        this.state.isTyping = false;
        if (this.renderer) this.renderer.completeTyping();
        if (this.state.isAuto) this._scheduleNext(this.settings.autoSpeed || 2000);
        return;
      }
      this._stopAutoTimer();
      this.state.dialogueIndex++;
      this._renderCurrentDialogue();
      return;
    }

    if (this.state.isTyping) {
      // 1) 타이핑 중이면 즉시 전체 표시만 수행 (다음 대사로 안 넘어감)
      this.state.isTyping = false;
      if (this.renderer) this.renderer.completeTyping();
      if (this.state.isAuto) this._scheduleNext(this.settings.autoSpeed || 2000);
      return;
    }

    // 2) 타이핑이 완료된 상태면 다음 대사로 진행
    this._stopAutoTimer();
    this.state.dialogueIndex++;
    this._renderCurrentDialogue();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 대사 완료 후 분기 및 특수 장면 처리
  // ════════════════════════════════════════════════════════════════════════════

  _onDialoguesFinished(scene) {
    this._stopAutoTimer();

    // 선택지 반응 대사 종료 후 원래 흐름 복귀
    if (scene._onDone) {
      const done = scene._onDone;
      this.scenes.delete(scene.id);
      done();
      return;
    }

    // Day 3 동적 장면 처리
    if (scene.type === 'bus_to_island') {
      const target = this.state.busChoice || 'dakgalbi';
      this.goToScene(`s11_${target}`);
      return;
    }
    if (scene.type === 'judge') { this._handlePierSunsetJudgement(); return; }
    if (scene.type === 'final') { this._presentFinalChoice(); return; }

    // 1. Day 1 다음 장소 선택 씬 (s03_2_day1_messages)
    if (scene.id === 's03_2_day1_messages') {
      this._handleDay1RepeatBranch();
      return;
    }

    // 2. Day 2 시작 인트로 종료 -> 인물 선택
    if (scene.id === 's07_day2') {
      this._presentDay2RemainingChoices();
      return;
    }

    // 3. Day 2 개별 인물 만남 종료 -> 남은 인물 진행 또는 #8 마무리
    if (scene.id === 's07_dakgalbi' || scene.id === 's07_yangnyeom' || scene.id === 's07_goguma') {
      const cid = scene.id.replace('s07_', '');
      if (!this.state.day2Visited.includes(cid)) {
        this.state.day2Visited.push(cid);
      }
      if (this.state.day2Visited.length >= 3) {
        this.goToScene('s08_day2_end');
      } else {
        this._presentDay2RemainingChoices();
      }
      return;
    }

    // 4. 엔딩 씬 대사 종료 후 -> 엔딩 타이틀 + 타이틀 복귀 버튼
    if (scene.type === 'ending') {
      const endLabel = scene.endingTitle ? `엔딩: ${scene.endingTitle}` : '이야기가 마무리되었습니다.';
      this._presentChoices(endLabel, [
        { text: '타이틀 화면으로 돌아가기', next: '__TITLE__' }
      ], { isEndingTitle: true });
      return;
    }

    // 5. 일반 씬의 선택지가 있는 경우
    if (scene.choices && scene.choices.options?.length > 0) {
      let opts = scene.choices.options;
      if (scene.id === 's02_place_select' && scene.choices.id === 'place_1') {
        const placeImgMap = { lego: 'bg_legoland', skywalk: 'bg_skywalk', myeongdong: 'bg_dakgalbi_alley' };
        opts = opts.map(o => ({ ...o, imageKey: placeImgMap[o.placeKey] || null }));
      }
      this._presentChoices(scene.choices.question, opts);
      return;
    }

    // 6. DAY 전환 연출 (s06_day1_end -> DAY 2, s08_day2_end -> DAY 3)
    if (scene.id === 's06_day1_end') {
      this._runDayTransition(2, '조금씩 가까워지는 사이', 's07_day2');
      return;
    }

    if (scene.id === 's08_day2_end') {
      this._runDayTransition(3, '남이섬으로 향하는 배', 's09_pier');
      return;
    }

    // 7. 다음 씬 이동
    if (scene.next) {
      this.goToScene(scene.next);
      return;
    }
  }

  // ─── Day 1 & Day 2 순차 선택 핸들러 ─────────────────────────────────────────

  _handleDay1RepeatBranch() {
    // 3개 장소를 모두 방문했으면 Day 1 마무리(s06_day1_end)로 이동
    if (this.state.day1Visited.length >= 3) {
      this.goToScene('s06_day1_end');
      return;
    }

    const msgScene = this.scenes.get('s03_2_day1_messages');
    const postLine = msgScene?.postChoiceLine
      ? [msgScene.postChoiceLine]
      : [{ speaker: '주인공', speakerType: 'vo', text: '다음은 여기다!', characters: [] }];

    const allPlaces = [
      { key: 'lego', text: '레고랜드 — 다양한 놀이기구와 볼거리가 있는 테마파크', next: 's03_lego', followUp: postLine },
      { key: 'skywalk', text: '스카이워크 — 탁 트인 강 풍경을 감상할 수 있는 명소', next: 's03_skywalk', followUp: postLine },
      { key: 'myeongdong', text: '명동 닭갈비 골목 — 춘천의 대표 먹거리를 즐길 수 있는 거리', next: 's03_myeongdong', followUp: postLine },
    ];

    const available = allPlaces.filter(p => !this.state.day1Visited.includes(p.key));

    // 마지막 하나는 선택 화면 없이 자동 진행 ("다음은 여기다!" 후 이동)
    if (available.length === 1) {
      this.selectChoice(available, 0);
      return;
    }

    this._presentChoices('다음 장소 선택', available);
  }

  _presentDay1PlaceChoices(choiceObj) {
    const allPlaces = [
      { key: 'lego', text: 'A: 레고랜드 — "다양한 놀이기구와 볼거리가 있는 테마파크"', next: 's03_lego' },
      { key: 'skywalk', text: 'B: 스카이워크 — "탁 트인 강 풍경을 감상할 수 있는 명소"', next: 's03_skywalk' },
      { key: 'myeongdong', text: 'C: 명동 닭갈비 골목 — "춘천의 대표 먹거리를 즐길 수 있는 거리"', next: 's03_myeongdong' },
    ];

    const available = allPlaces.filter(p => !this.state.day1Visited.includes(p.key));
    this._presentChoices(choiceObj?.question || "다음은! 여기다.", available);
  }

  // ─── DAY 전환 연출 (입력 잠금은 연출 중에만, 종료/안전장치로 반드시 해제) ───
  _runDayTransition(dayNum, subtitle, nextSceneId) {
    this._stopAutoTimer();
    this.state.isAuto = false;
    this.state.isSkip = false;
    if (this.renderer) this.renderer.updateMenuBar(false, false);
    this.state.isTransitioning = true;
    let switched = false;
    const doSwitch = () => {
      if (switched) return;
      switched = true;
      this.goToScene(nextSceneId);
    };
    const unlock = () => {
      doSwitch();
      this.state.isTransitioning = false;
    };
    if (this.renderer && typeof this.renderer.playDayTransition === 'function') {
      this.renderer.playDayTransition(dayNum, subtitle, unlock, doSwitch);
    } else {
      unlock();
    }
    // 최종 안전장치 (타이머가 끝나면 무조건 잠금 해제)
    const c = Object.assign({ fadeOutMs: 1500, holdMs: 3500, fadeInMs: 1500 }, this.config?.dayTransition || {});
    setTimeout(() => { if (this.state.isTransitioning) unlock(); }, c.fadeOutMs + c.holdMs + c.fadeInMs + 3000);
  }

  // ─── Day 3: #10-2 수상버스 좌석 선택 (세 자리를 모두 방문, 본 자리는 선택지에서 사라짐) ───
  _presentDay3SeatChoices() {
    this.state.sceneId = 's10_2_seat';
    const seatScene = this.scenes.get('s10_2_seat');
    const src = seatScene?.choices?.options || [];
    const visited = this.state.day3SeatVisited || [];
    const remain = src.filter(o => !visited.includes(o.charId));
    if (remain.length === 0) { this.goToScene('s11_1_arrive'); return; }
    const prompts = seatScene?.seatPrompts || {};
    const promptText = visited.length === 0 ? (prompts.first || '') : (prompts.revisit || '');
    this._presentChoices(promptText, remain, { isNarration: true });
  }

  // ─── Day 3: #11-2 남이섬 장소 선택 (본 이벤트 사라짐, 마지막 하나는 자동 진행) ───
  _prepPlaceSelect(scene) {
    const order = this.state.day3Order || [];
    const remain = scene.places.filter(p => !order.includes(p.id));
    if (remain.length === 1 && order.length > 0) {
      scene.dialogues = [{ speaker: null, speakerType: 'narration', text: scene.lastCall, characters: [] }];
    } else {
      scene.dialogues = remain.map(p => {
        if (order.length === 0) return p.proposal;
        const t = p.proposal.text.replace(/^(저는\s*|…\s*)/, '');
        return { ...p.proposal, text: `그럼 저는… ${t}` };
      });
    }
  }

  _presentPlaceSelect(scene) {
    const order = this.state.day3Order || [];
    const remain = scene.places.filter(p => !order.includes(p.id));
    if (remain.length === 0) { this.goToScene('s13_sunset'); return; }
    if (remain.length === 1) { this.goToScene(remain[0].next); return; }
    this._presentChoices('', remain.map((p, i) => ({
      key: String.fromCharCode(65 + i),
      charId: p.id,
      text: p.optionText,
      next: p.next,
      effectDesc: '',
      effects: null,
      followUp: [],
    })));
  }

  // ─── Day 3: #13 노을 (호감도 1위 캐릭터 한 줄, 동점이면 마지막으로 본 이벤트 캐릭터) ───
  _prepSunset(scene) {
    if (!scene._base) scene._base = scene.dialogues.slice();
    const aff = this.state.affinity || {};
    const ids = ['dakgalbi', 'yangnyeom', 'goguma'];
    const max = Math.max(...ids.map(i => aff[i] || 0));
    const tops = ids.filter(i => (aff[i] || 0) === max);
    let top = tops[0];
    if (tops.length > 1) {
      const order = this.state.day3Order || [];
      top = tops.slice().sort((x, y) => order.indexOf(y) - order.indexOf(x))[0];
    }
    const line = scene.topLines && scene.topLines[top];
    scene.dialogues = scene._base.concat(line ? [line] : []);
  }

  // ─── 호감도 반영 (내부 affinity 사용, 화면에는 숫자 대신 문구 + 막대 바만 표시) ───
  _applyLikeEffects(effects) {
    const charName = (id) => this.currentCharacters[id]?.name || id;
    const isCompact = !!effects.compact;
    const labelMode = effects.labelMode || null;
    for (const [id, delta] of Object.entries(effects.like || {})) {
      if (!delta || delta <= 0) continue;
      const prev = this.state.affinity[id] || 0;
      const next = Math.max(0, Math.min(10, prev + delta));
      this.state.affinity[id] = next;
      if (this.renderer && typeof this.renderer.showLikeFeedback === 'function') {
        this.renderer.showLikeFeedback(id, charName(id), delta, prev, next, isCompact, labelMode);
      }
    }
    if (this.renderer) {
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  _followUpToDialogue(f) {
    if (f && f.characters !== undefined) return f;
    const m = (f.speaker || '').match(/^([^\[]+)(?:\[([^\]]+)\])?$/);
    let name = (m ? m[1] : f.speaker || '').trim();
    let expr = m && m[2] ? m[2].trim() : '기본';
    let speakerType = 'normal';
    if (name.includes('(V.O.)') || name.includes('(속마음)')) {
      speakerType = 'vo';
      name = name.replace(/\(V\.O\.\)|\(속마음\)/g, '').trim();
    } else if (name.includes('(O.S.)') || name.includes('(화면 밖)') || name.includes('[화면 밖]')) {
      speakerType = 'os';
      name = name.replace(/\(O\.S\.\)|\(화면 밖\)|\[화면 밖\]/g, '').trim();
    }
    let blush = false;
    if (expr.includes('+홍조')) { blush = true; expr = expr.replace('+홍조', '').trim(); }
    let id = null;
    if (name === '???' && expr.includes('|')) {
      const parts = expr.split('|');
      const cName = parts[0].trim();
      expr = parts[1] ? parts[1].trim() : '기본';
      if (cName.includes('닭갈비') || cName.includes('닭고기')) id = 'dakgalbi';
      else if (cName.includes('양념')) id = 'yangnyeom';
      else if (cName.includes('고구마')) id = 'goguma';
      else if (cName.includes('볶음밥')) id = 'bokkeumbap';
    } else {
      if (name.includes('닭갈비') || name.includes('닭고기')) id = 'dakgalbi';
      else if (name.includes('양념')) id = 'yangnyeom';
      else if (name.includes('고구마')) id = 'goguma';
      else if (name.includes('볶음밥')) id = 'bokkeumbap';
    }
    return {
      speaker: name,
      speakerType,
      text: f.text,
      characters: id ? [{ id, position: 'center', expression: expr, blush }] : [],
    };
  }

  _presentDay2RemainingChoices() {
    this.state.sceneId = 's07_day2';

    if (this.state.day2Visited.length >= 3) {
      this.goToScene('s08_day2_end');
      return;
    }

    const allChars = [
      { id: 'dakgalbi', role: '닭갈비', next: 's07_dakgalbi' },
      { id: 'yangnyeom', role: '양념', next: 's07_yangnyeom' },
      { id: 'goguma', role: '고구마', next: 's07_goguma' },
    ];

    const remaining = allChars.filter(c => !this.state.day2Visited.includes(c.id));

    // 마지막 한 명은 선택 없이 자동 진행
    if (remaining.length === 1) {
      this.state.day2Target = remaining[0].id;
      this.goToScene(remaining[0].next);
      return;
    }

    const options = remaining.map((c, idx) => {
      const charName = this.currentCharacters[c.id]?.name || (typeof getDisplayName === 'function' ? getDisplayName(c.id, this.state.gender) : c.role);
      return {
        key: String.fromCharCode(65 + idx),
        charId: c.id,
        text: charName,
        next: c.next,
      };
    });

    const question = this.state.day2Visited.length === 0
      ? '누구에게 먼저 연락해볼까?'
      : '';

    this._presentChoices(question, options);
  }

  // ─── #12 춘천 선착장 해질녘 판정 (기준치 8점, 세 명 모두 미달일 때만 볶음밥 등장) ───

  _handlePierSunsetJudgement() {
    const baseTh = this.config?.LIKE_THRESHOLD ?? 8;
    const th = this.config?.endingThresholds || { dakgalbi: baseTh, yangnyeom: baseTh, goguma: baseTh };
    const aff = this.state.affinity || {};
    const isHidden = (
      (aff.dakgalbi || 0) < (th.dakgalbi ?? baseTh) &&
      (aff.yangnyeom || 0) < (th.yangnyeom ?? baseTh) &&
      (aff.goguma || 0) < (th.goguma ?? baseTh)
    );

    this.state.hiddenRoute = isHidden;

    if (isHidden) {
      this.goToScene('s12_hidden_bokkeumbap');
    } else {
      this.goToScene('s12_final_choice');
    }
  }

  // ─── #12 최종 선택 화면 (버튼 잠김 / 히든 노출) ─────────────────────────────

  _presentFinalChoice() {
    const baseTh = this.config?.LIKE_THRESHOLD ?? 8;
    const th = this.config?.endingThresholds || { dakgalbi: baseTh, yangnyeom: baseTh, goguma: baseTh };
    const options = [];

    // 1. 닭고기
    const dakgalbiName = this.currentCharacters.dakgalbi.name;
    const dakgalbiOk = (this.state.affinity.dakgalbi || 0) >= (th.dakgalbi ?? baseTh);
    options.push({
      text: `${dakgalbiName}에게 마음을 전한다`,
      disabled: !dakgalbiOk,
      lockedReason: '아직은 좋은 친구 사이',
      next: 'ending_dakgalbi',
    });

    // 2. 양념
    const yangnyeomName = this.currentCharacters.yangnyeom.name;
    const yangnyeomOk = (this.state.affinity.yangnyeom || 0) >= (th.yangnyeom ?? baseTh);
    options.push({
      text: `${yangnyeomName}에게 마음을 전한다`,
      disabled: !yangnyeomOk,
      lockedReason: '아직은 서로를 알아가는 중',
      next: 'ending_yangnyeom',
    });

    // 3. 고구마
    const gogumaName = this.currentCharacters.goguma.name;
    const gogumaOk = (this.state.affinity.goguma || 0) >= (th.goguma ?? baseTh);
    options.push({
      text: `${gogumaName}에게 마음을 전한다`,
      disabled: !gogumaOk,
      lockedReason: '아직은 편한 친구 사이',
      next: 'ending_goguma',
    });

    // 4. 볶음밥 (hidden_route일 때만 표시)
    if (this.state.hiddenRoute) {
      const bokkeumbapName = this.currentCharacters.bokkeumbap.name;
      options.push({
        text: `${bokkeumbapName}에게 다가간다`,
        disabled: false,
        next: 'ending_bokkeumbap_intro',
      });
    }

    // 5. 혼자 돌아간다 (항상 활성)
    options.push({
      text: '혼자 돌아간다',
      disabled: false,
      next: 'ending_alone',
    });

    this._presentChoices('당신의 마지막 마음을 전할 상대를 선택하세요.', options);
  }

  // ─── 선택지 팝업 및 선택 처리 ──────────────────────────────────────────────

  _presentChoices(question, options, choiceOpts = {}) {
    this.state.choiceActive = true;
    this._stopAutoTimer();
    this.state.isSkip = false;

    // 선택지 문구 내 변수 치환 및 호감도 효과 안내 문구 제거
    const cleanOptText = (raw) => {
      if (!raw) return '';
      return raw
        .replace(/\s*—\s*효과\s*:.*$/, '')
        .replace(/\s*\(효과\s*:.*?\)/, '')
        .trim();
    };

    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || (this.state.gender === 'male' ? '다고길' : '다곡희'),
      양념: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      yangnyeom: this.currentCharacters.yangnyeom?.name || (this.state.gender === 'male' ? '양연우' : '양연미'),
      고구마: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      goguma: this.currentCharacters.goguma?.name || (this.state.gender === 'male' ? '고구민' : '고규미'),
      볶음밥: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || (this.state.gender === 'male' ? '박복검' : '박복은'),
    };

    const processedOptions = options.map(opt => ({
      ...opt,
      text: resolveTextVariables(cleanOptText(opt.text), vars)
    }));

    if (this.ui) this.ui.setChoicesActive(true);
    if (this.renderer) {
      this.renderer.updateMenuBar(this.state.isAuto, this.state.isSkip);
      this.renderer.showChoices(question, processedOptions, (idx) => {
        this.selectChoice(options, idx);
      }, choiceOpts);
    }
  }

  selectChoice(options, optionIndex) {
    if (!options || !options[optionIndex]) return;
    const chosen = options[optionIndex];

    this.state.choiceActive = false;
    if (this.ui) this.ui.setChoicesActive(false);

    // 수치 효과 적용
    if (chosen.effects) {
      this.applyEffects(chosen.effects);
    }

    // 선택에 대한 캐릭터 반응 대사 재생 (호감도 변화 -> 반응 대사 -> 원래 다음 흐름)
    if (chosen.followUp && chosen.followUp.length > 0) {
      const origId = this.state.sceneId;
      const origScene = this.scenes.get(origId) || {};
      this._followOrigId = origId;
      this.scenes.set('__followup__', {
        ...origScene,
        id: '__followup__',
        type: 'normal',
        bgm: null,
        dialogues: chosen.followUp.map(f => this._followUpToDialogue(f)).concat(
          (origScene.lastExtra && (this.state.day3Order || []).length === 2 && !(this.state.day3Order || []).includes(origScene.lastExtra.characters?.[0]?.id)) ? [origScene.lastExtra] : []
        ),
        choices: null,
        midChoices: null,
        next: null,
        _onDone: () => {
          this.state.sceneId = origId;
          const opts = options.map((o, i) => (i === optionIndex ? { ...o, followUp: [], effects: null } : o));
          this.selectChoice(opts, optionIndex);
        },
      });
      this.goToScene('__followup__');
      return;
    }

    // 인라인 선택지 완료 -> 원래 씬의 다음 대사(합류/공통 대사)로 복귀
    if (this._inlineChoice) {
      const { sceneId, nextIndex } = this._inlineChoice;
      this._inlineChoice = null;
      this.goToScene(sceneId, nextIndex);
      return;
    }

    // #10 수상버스 좌석 선택 기록 (bus_choice)
    if (this.state.sceneId === 's10_bus' && chosen.charId) {
      this.state.busChoice = chosen.charId;
    }

    // Day 2 대상 선택 기록
    if (this.state.sceneId === 's07_day2') {
      if (chosen.charId) {
        this.state.day2Target = chosen.charId;
      }
    }

    const currentScene = this.scenes.get(this.state.sceneId);
    const nextTarget = chosen.next || currentScene?.next;

    if (nextTarget) {
      this.goToScene(nextTarget);
    } else {
      console.warn(`[GameEngine] 다음 씬을 찾을 수 없습니다. 현재 씬: ${this.state.sceneId}`);
    }
  }

  applyEffects(effects) {
    if (effects && (effects.like || effects.likeVisual)) {
      this._applyLikeEffects(effects);
      return;
    }
    let delta = effects.score || 0;
    if (!delta && effects.scale && this.scoreScale) {
      delta = this.scoreScale[effects.scale] || 0;
    }

    // 복수 캐릭터 수치 효과가 명시된 경우 (예: { dakgalbi: 2, yangnyeom: 2 })
    if (effects.characters) {
      for (const [cid, val] of Object.entries(effects.characters)) {
        if (this.state.affinity[cid] !== undefined) {
          const prev = this.state.affinity[cid];
          const next = Math.max(0, prev + val);
          this.state.affinity[cid] = next;
          const charName = this.currentCharacters[cid]?.name;
          if (this.settings.showAffinity && this.renderer && val) {
            if (typeof this.renderer.showLikeFeedback === 'function') {
              this.renderer.showLikeFeedback(cid, charName, val, prev, next, false);
            } else {
              this.renderer.showAffinityPopup(cid, val, charName);
            }
          }
        }
      }
    } else {
      // 단일 캐릭터 판별
      let targetChar = effects.targetChar || null;
      if (!targetChar) {
        if (this.state.sceneId.includes('dakgalbi') || this.state.sceneId === 's03_lego') targetChar = 'dakgalbi';
        else if (this.state.sceneId.includes('yangnyeom') || this.state.sceneId === 's03_myeongdong') targetChar = 'yangnyeom';
        else if (this.state.sceneId.includes('goguma') || this.state.sceneId === 's03_skywalk') targetChar = 'goguma';
      }

      if (targetChar && delta) {
        const prev = this.state.affinity[targetChar] || 0;
        const next = Math.max(0, prev + delta);
        this.state.affinity[targetChar] = next;
        const charName = this.currentCharacters[targetChar]?.name;

        if (this.settings.showAffinity && this.renderer) {
          if (typeof this.renderer.showLikeFeedback === 'function') {
            this.renderer.showLikeFeedback(targetChar, charName, delta, prev, next, false);
          } else {
            this.renderer.showAffinityPopup(targetChar, delta, charName);
          }
        }
      }

      // 고민 상태 업데이트
      if (targetChar && effects.troubleState) {
        this.state.troubleStates[targetChar] = effects.troubleState;
      }
    }

    if (this.renderer) {
      this.renderer.updateAffinityBar(this.state.affinity, this.currentCharacters, this.settings.showAffinity);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 자동 / 스킵 / 디버그 제어
  // ════════════════════════════════════════════════════════════════════════════

  toggleAuto() {
    if (this.state.isTransitioning) return;
    this.state.isAuto = !this.state.isAuto;
    if (this.state.isAuto) {
      this.state.isSkip = false;
      if (!this.state.isTyping && !this.state.choiceActive) {
        this._scheduleNext(this.settings.autoSpeed || 2000);
      }
    } else {
      this._stopAutoTimer();
    }
    if (this.renderer) {
      this.renderer.updateMenuBar(this.state.isAuto, this.state.isSkip);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  toggleSkip() {
    if (this.state.isTransitioning) return;
    this.state.isSkip = !this.state.isSkip;
    if (this.state.isSkip) {
      this.state.isAuto = false;
      this._stopAutoTimer();
      if (!this.state.isTyping && !this.state.choiceActive) {
        this.nextDialogue();
      }
    }
    if (this.renderer) {
      this.renderer.updateMenuBar(this.state.isAuto, this.state.isSkip);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  toggleDebug() {
    this.state.debugMode = !this.state.debugMode;
    if (this.renderer) {
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }
  }

  jumpToScene(sceneId) {
    if (!this.scenes.has(sceneId)) return;
    this.goToScene(sceneId, 0);
  }

  _scheduleNext(delay) {
    this._stopAutoTimer();
    this._autoTimer = setTimeout(() => {
      this._autoTimer = null;
      if (!this.state.choiceActive && !this.state.isTransitioning) {
        this.nextDialogue();
      }
    }, delay);
  }

  _stopAutoTimer() {
    if (this._autoTimer !== null) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  }

  // ─── 기록실 데이터 ─────────────────────────────────────────────────────────

  getGalleryData() {
    const dakgalbiName = this.currentCharacters.dakgalbi?.name || '닭갈비';
    const yangnyeomName = this.currentCharacters.yangnyeom?.name || '양념';
    const gogumaName = this.currentCharacters.goguma?.name || '고구마';
    const bokkeumbapName = this.currentCharacters.bokkeumbap?.name || '볶음밥';

    const allEndings = [
      { id: 'ending_dakgalbi', title: `${dakgalbiName} 엔딩: 너와 함께하는 춘천`, badge: 'NORMAL', description: `${dakgalbiName}에게 마음을 전하고 둘만의 여행을 시작하는 엔딩.` },
      { id: 'ending_yangnyeom', title: `${yangnyeomName} 엔딩: 솔직해지는 순간`, badge: 'NORMAL', description: `${yangnyeomName}와 솔직한 마음을 나누는 엔딩.` },
      { id: 'ending_goguma', title: `${gogumaName} 엔딩: 나를 위한 선택`, badge: 'NORMAL', description: `${gogumaName}와 함께 행복해지는 방법을 찾아가는 엔딩.` },
      { id: 'ending_bokkeumbap_reunion', title: `${bokkeumbapName} 히든 엔딩: 다시, 우리라는 이름으로.`, badge: 'SECRET', description: `선착장에서 재회한 ${bokkeumbapName}와 다시 시작하는 엔딩.` },
      { id: 'ending_bokkeumbap_normal', title: `${bokkeumbapName} 노멀 엔딩: 각자의 속도로`, badge: 'NORMAL', description: `선착장에서 ${bokkeumbapName}와의 약속에 마침표를 찍는 엔딩.` },
      { id: 'ending_alone', title: '혼자 돌아가기 엔딩: 나만의 여행', badge: 'SOLO', description: '누구에게도 마음을 전하지 않고 춘천을 떠나며 다시 올 날을 기약하는 엔딩.' },
    ];

    const achievedEndings = this.saveManager ? this.saveManager.loadAchievements() : new Set();
    return { allEndings, achievedEndings };
  }
}
