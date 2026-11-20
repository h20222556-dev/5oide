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
      reunion_temp: 0,             // 히든 수치
      troubleStates: { dakgalbi: null, yangnyeom: null, goguma: null },

      hiddenUnlocked: false,       // s14 판정 결과
      revealedSpeakers: new Set(), // 실제 이름이 밝혀진 캐릭터 목록

      day1Visited: [],             // Day 1 방문한 장소 목록 ['lego', 'skywalk', ...]
      day2Target: null,            // Day 2 선택한 캐릭터
      chosenSeat: null,            // s10에서 선택한 좌석 캐릭터

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

  setRenderer(renderer) { this.renderer = renderer; }
  setUI(ui) { this.ui = ui; }
  setSaveManager(save) { this.saveManager = save; }
  setAudioManager(audio) { this.audioManager = audio; }
  setAchievedEndings() {}

  async init() {
    // 1. config 로드
    this.config = await loadJSON('config/game_config.json');
    this.scoreScale = await loadJSON('config/score_scale.json');
    this.charactersAll = await loadJSON('config/characters.json');

    // 2. 모든 씬 파일 로드
    const sceneFiles = this.config.sceneFiles || [];
    for (const file of sceneFiles) {
      try {
        const scene = await loadJSON(`data/scenes/${file}`);
        if (scene && scene.id) {
          this.scenes.set(scene.id, scene);
        }
      } catch (err) {
        console.warn(`[GameEngine] 씬 로드 실패 (${file}):`, err);
      }
    }

    // 3. 설정값 반영
    this.settings.textSpeed = this.config.textSpeed ?? 40;
    this.settings.autoSpeed = this.config.autoSpeed ?? 2000;
    this.settings.skipSpeed = this.config.skipSpeed ?? 25;
    this.settings.bgmVolume = this.config.bgmVolume ?? 0.5;
    this.settings.sfxVolume = this.config.sfxVolume ?? 0.7;
    this.settings.showAffinity = this.config.showAffinity !== false;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 게임 시작 흐름 (성별 선택 -> 이름 입력 -> 프롤로그)
  // ════════════════════════════════════════════════════════════════════════════

  startNewGameFlow() {
    if (!this.renderer) return;

    // 1. 성별 선택 모달 표시
    this.renderer.showGenderModal((selectedGender) => {
      this.state.gender = selectedGender;

      // 2. 이름 입력 모달 표시
      this.renderer.showNameModal((enteredName) => {
        this.state.playerName = enteredName.trim() || '주인공';

        // 3. 상태 초기화 후 프롤로그 진입
        this._initNewGameState();
        this.renderer.showScreen('game');
        this.goToScene('s01_prologue');
      });
    });
  }

  _initNewGameState() {
    this.state.affinity = { dakgalbi: 0, yangnyeom: 0, goguma: 0 };
    this.state.reunion_temp = 0;
    this.state.troubleStates = { dakgalbi: null, yangnyeom: null, goguma: null };
    this.state.hiddenUnlocked = false;
    this.state.revealedSpeakers = new Set();
    this.state.day1Visited = [];
    this.state.day2Target = null;
    this.state.chosenSeat = null;

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
      this.renderer.showScreen('title');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 세이브 / 로드 연동 상태 관리
  // ════════════════════════════════════════════════════════════════════════════

  getState() {
    return {
      gender: this.state.gender,
      playerName: this.state.playerName,
      chapter: this.state.chapter,
      sceneId: this.state.sceneId,
      dialogueIndex: this.state.dialogueIndex,
      affinity: { ...this.state.affinity },
      reunion_temp: this.state.reunion_temp,
      troubleStates: { ...this.state.troubleStates },
      hiddenUnlocked: this.state.hiddenUnlocked,
      revealedSpeakers: Array.from(this.state.revealedSpeakers),
      day1Visited: [...this.state.day1Visited],
      day2Target: this.state.day2Target,
      chosenSeat: this.state.chosenSeat,
      seenDialogues: [...this.state.seenDialogues],
      settings: { ...this.settings },
    };
  }

  loadState(saved) {
    if (!saved) return;
    this._stopAutoTimer();

    this.state.gender = saved.gender || 'female';
    this.state.playerName = saved.playerName || '주인공';
    this.state.chapter = saved.chapter || 1;
    this.state.affinity = { ...(saved.affinity || { dakgalbi: 0, yangnyeom: 0, goguma: 0 }) };
    this.state.reunion_temp = saved.reunion_temp || 0;
    this.state.troubleStates = { ...(saved.troubleStates || {}) };
    this.state.hiddenUnlocked = !!saved.hiddenUnlocked;
    this.state.revealedSpeakers = new Set(saved.revealedSpeakers || []);
    this.state.day1Visited = [...(saved.day1Visited || [])];
    this.state.day2Target = saved.day2Target || null;
    this.state.chosenSeat = saved.chosenSeat || null;

    this.state.seenDialogues = new Set(saved.seenDialogues || []);
    this.state.dialogueIndex = saved.dialogueIndex || 0;
    this.state.isAuto = false;
    this.state.isSkip = false;
    this.state.isTyping = false;
    this.state.choiceActive = false;

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
      this.renderer.updateAffinityBar(this.state.affinity, this.currentCharacters, this.settings.showAffinity);
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
    this._stopAutoTimer();

    if (this.ui) this.ui.setChoicesActive(false);
    if (this.renderer) {
      this.renderer.hideChoices();
      this.renderer.hidePhoneMessages();
      this.renderer.setBackground(scene.background);
      this.renderer.setTime(scene.time);
      this.renderer.updateDebugPanel(this.state, Array.from(this.scenes.values()));
    }

    if (this.audioManager && scene.bgm) {
      this.audioManager.playBGM(scene.bgm);
    }

    // 특수 씬 진입 처리 (Day 1 방문 기록 등)
    if (sceneId === 's03_lego') this.state.day1Visited.push('lego');
    else if (sceneId === 's03_skywalk') this.state.day1Visited.push('skywalk');
    else if (sceneId === 's03_myeongdong') this.state.day1Visited.push('myeongdong');

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

    const dialogues = scene.dialogues || [];

    // 대사 목록 끝 도달
    if (this.state.dialogueIndex >= dialogues.length) {
      this._onDialoguesFinished(scene);
      return;
    }

    const d = dialogues[this.state.dialogueIndex];
    const dKey = `${this.state.sceneId}__${this.state.dialogueIndex}`;
    const alreadySeen = this.state.seenDialogues.has(dKey);
    this.state.seenDialogues.add(dKey);

    // 텍스트 변수 및 조사 치환
    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || '다곡희',
      yangnyeom: this.currentCharacters.yangnyeom?.name || '양연미',
      goguma: this.currentCharacters.goguma?.name || '고규미',
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || '박복은',
    };

    let processedText = resolveTextVariables(d.text, vars);

    // 실제 이름 공개 여부 판별 (← 이 대사부터 화자 이름이 ???에서 실제 이름으로 바뀜)
    if (d.text.includes('실제 이름으로 바뀜')) {
      if (d.speaker?.includes('닭갈비')) this.state.revealedSpeakers.add('dakgalbi');
      if (d.speaker?.includes('고구마')) this.state.revealedSpeakers.add('goguma');
      if (d.speaker?.includes('양념')) this.state.revealedSpeakers.add('yangnyeom');
      // 안내 지문 제거
      processedText = processedText.replace(/\(←\s*이 대사부터[^\)]+\)/g, '').trim();
    }

    // 화자 이름 결정
    let speakerDisplayName = d.speaker;
    let speakerColor = null;

    if (d.speaker) {
      if (d.speaker.includes('나레이션') || d.speaker.includes('내레이션') || d.speakerType === 'narration') {
        speakerDisplayName = null;
      } else if (d.speaker === '???') {
        speakerDisplayName = '???';
      } else {
        // 괄호 수식어((V.O.), (O.S.), (속마음) 등) 제거
        let cleanSpeaker = d.speaker.replace(/\(V\.O\.\)|\(O\.S\.\)|\(속마음\)|\(화면\s*밖\)|\[화면\s*밖\]/g, '').trim();

        // 캐릭터 ID 치환
        for (const [cid, cData] of Object.entries(this.currentCharacters)) {
          if (cleanSpeaker.includes(cData.role) || cleanSpeaker.includes(cid)) {
            // 아직 이름이 밝혀지지 않았으면 ???
            if (!this.state.revealedSpeakers.has(cid) && ['s03_lego', 's03_skywalk', 's03_myeongdong'].includes(this.state.sceneId)) {
              speakerDisplayName = '???';
            } else {
              speakerDisplayName = cData.name;
              speakerColor = cData.color;
            }
            break;
          }
        }
        if (cleanSpeaker === '주인공') {
          speakerDisplayName = this.state.playerName;
        }
      }
    }


    if (this.renderer) {
      this.renderer.setSpeaker(speakerDisplayName, speakerColor, d.speakerType);
      this.renderer.setDialogueStyle(d.speakerType);
      this.renderer.setCharacters(d.characters, d.speaker, this.state.gender);
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

  nextDialogue() {
    if (this.state.choiceActive) return;

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

    // 1. Day 1 메시지 씬 (s03_2_day1_messages)
    if (scene.id === 's03_2_day1_messages') {
      this._handleDay1MessageScene();
      return;
    }

    // 2. Day 1 다음 장소 반복 (s04_s05_day1_repeat)
    if (scene.id === 's04_s05_day1_repeat') {
      this._handleDay1RepeatBranch();
      return;
    }

    // 3. 선착장 해질녘 판정 (s14_pier_sunset)
    if (scene.id === 's14_pier_sunset') {
      this._handlePierSunsetJudgement();
      return;
    }

    // 4. 분기 A/B 종료 후 -> s15_final_choice
    if (scene.id === 's14_pier_sunset_a' || scene.id === 's14_pier_sunset_b') {
      this.goToScene('s15_final_choice');
      return;
    }

    // 5. 최종 선택 화면 (s15_final_choice)
    if (scene.id === 's15_final_choice') {
      this._presentFinalChoice();
      return;
    }

    // 6. 뱃길 대화 종료 후 -> 남이섬으로 연결 (s11_dakgalbi -> s12_dakgalbi 등)
    if (scene.id === 's11_dakgalbi') { this.goToScene('s12_dakgalbi'); return; }
    if (scene.id === 's11_yangnyeom') { this.goToScene('s12_yangnyeom'); return; }
    if (scene.id === 's11_goguma') { this.goToScene('s12_goguma'); return; }

    // 7. 남이섬 이벤트 종료 후 -> s14_pier_sunset
    if (scene.id === 's12_dakgalbi' || scene.id === 's12_yangnyeom' || scene.id === 's12_goguma') {
      this.goToScene('s14_pier_sunset');
      return;
    }

    // 8. 엔딩 씬 대사 종료 후 -> 타이틀 복귀 버튼
    if (scene.type === 'ending') {
      this._presentChoices("이야기가 마무리되었습니다.", [
        { text: "타이틀 화면으로 돌아가기", next: "__TITLE__" }
      ]);
      return;
    }

    // 9. 일반 씬의 선택지
    if (scene.choices && scene.choices.options?.length > 0) {
      // Day 1 두 번째/세 번째 장소 선택지 동적 필터링
      if (scene.choices.id === 'place_1' || scene.choices.id === 'place_2') {
        this._presentDay1PlaceChoices(scene.choices);
        return;
      }

      this._presentChoices(scene.choices.question, scene.choices.options);
      return;
    }

    // 10. 다음 씬이 지정되어 있으면 이동 (또는 기본 씬 연결 맵)
    const fallbackNextMap = {
      "s01_prologue": "s02_place_select",
      "s03_lego": "s03_2_day1_messages",
      "s03_skywalk": "s03_2_day1_messages",
      "s03_myeongdong": "s03_2_day1_messages",
      "s06_day1_end": "s07_day2",
      "s07_dakgalbi": "s08_day2_end",
      "s07_yangnyeom": "s08_day2_end",
      "s07_goguma": "s08_day2_end",
      "s08_day2_end": "s09_pier",
      "s09_pier": "s10_seat",
      "s11_dakgalbi": "s12_dakgalbi",
      "s11_yangnyeom": "s12_yangnyeom",
      "s11_goguma": "s12_goguma",
      "s12_dakgalbi": "s14_pier_sunset",
      "s12_yangnyeom": "s14_pier_sunset",
      "s12_goguma": "s14_pier_sunset",
      "s14_pier_sunset_a": "s15_final_choice",
      "s14_pier_sunset_b": "s15_final_choice"
    };

    const nextTarget = scene.next || fallbackNextMap[scene.id];
    if (nextTarget) {
      this.goToScene(nextTarget);
      return;
    }

  }

  // ─── Day 1 메시지 및 장소 선택 핸들러 ────────────────────────────────────────

  _handleDay1MessageScene() {
    // 가장 최근에 방문한 장소
    const lastVisited = this.state.day1Visited[this.state.day1Visited.length - 1];
    let partnerName = '연락처';
    let partnerId = 'dakgalbi';

    if (lastVisited === 'lego') { partnerId = 'dakgalbi'; partnerName = this.currentCharacters.dakgalbi.name; }
    else if (lastVisited === 'skywalk') { partnerId = 'goguma'; partnerName = this.currentCharacters.goguma.name; }
    else if (lastVisited === 'myeongdong') { partnerId = 'yangnyeom'; partnerName = this.currentCharacters.yangnyeom.name; }

    // 휴대폰 말풍선 메시지 데이터 생성
    const messages = [];
    if (partnerId === 'dakgalbi') {
      messages.push({ sender: 'player', senderName: this.state.playerName, text: "관광지 추천해주셔서 감사해요. 추천해주신 곳 꼭 가볼게요." });
      messages.push({ sender: partnerId, senderName: partnerName, text: `아, ${this.state.playerName} 씨 맞죠?` });
      messages.push({ sender: partnerId, senderName: partnerName, text: "ㅎㅎ 마음에 드셨으면 좋겠네요!" });
      messages.push({ sender: partnerId, senderName: partnerName, text: "다음에 또 만나면 그때는 더 재미있는 곳 소개해 드릴게요~!" });
    } else if (partnerId === 'goguma') {
      messages.push({ sender: 'player', senderName: this.state.playerName, text: "좋은 풍경 소개해 주셔서 감사했어요. 언젠가 카페도 놀러갈게요." });
      messages.push({ sender: partnerId, senderName: partnerName, text: `먼저 연락해 주셨네요, ${this.state.playerName} 씨.` });
      messages.push({ sender: partnerId, senderName: partnerName, text: `${this.state.playerName} 씨를 위해 따뜻한 음료를 준비해 둬야겠어요~` });
    } else if (partnerId === 'yangnyeom') {
      messages.push({ sender: 'player', senderName: this.state.playerName, text: "덕분에 추천해주신 식당에서 잘 먹고 가요~" });
      messages.push({ sender: partnerId, senderName: partnerName, text: "뭐야, 아까 그 사람 맞죠?" });
      messages.push({ sender: partnerId, senderName: partnerName, text: "진짜 연락까지 하실 줄은 몰랐는데." });
      messages.push({ sender: partnerId, senderName: partnerName, text: "궁금하시면 연락하세요." });
    }

    // 휴대폰 UI 팝업 표시 후 다음 장소 선택지로 진행
    if (this.renderer) {
      this.renderer.showPhoneMessages(partnerName, messages, () => {
        this._handleDay1RepeatBranch();
      });
    } else {
      this._handleDay1RepeatBranch();
    }
  }

  _handleDay1RepeatBranch() {
    // 3개 장소를 모두 방문했으면 Day 1 마무리(s06_day1_end)로 이동
    if (this.state.day1Visited.length >= 3) {
      this.goToScene('s06_day1_end');
      return;
    }

    // 남은 장소들로 동적 선택지 제시
    const allPlaces = [
      { key: 'lego', text: '레고랜드 — 테마파크', next: 's03_lego' },
      { key: 'skywalk', text: '소양강 스카이워크 — 강 풍경 명소', next: 's03_skywalk' },
      { key: 'myeongdong', text: '명동 닭갈비 골목 — 대표 먹거리 거리', next: 's03_myeongdong' },
    ];

    const available = allPlaces.filter(p => !this.state.day1Visited.includes(p.key));
    this._presentChoices("다음에는 어디로 가볼까?", available);
  }

  _presentDay1PlaceChoices(choiceObj) {
    const allPlaces = [
      { key: 'lego', text: 'A: 레고랜드 — 테마파크', next: 's03_lego' },
      { key: 'skywalk', text: 'B: 소양강 스카이워크 — 강 풍경 명소', next: 's03_skywalk' },
      { key: 'myeongdong', text: 'C: 명동 닭갈비 골목 — 대표 먹거리 거리', next: 's03_myeongdong' },
    ];

    const available = allPlaces.filter(p => !this.state.day1Visited.includes(p.key));
    this._presentChoices(choiceObj.question || "어디부터 갈까?", available);
  }

  // ─── s14 선착장 해질녘 판정 ────────────────────────────────────────────────

  _handlePierSunsetJudgement() {
    const thresholds = this.config?.endingThresholds || {
      hidden_all_three_each: 6,
      reunion_temp: 10
    };

    let isUnlocked = false;
    const mode = this.config?.hidden_unlock?.mode || 'all_three';

    if (mode === 'all_three') {
      const th = thresholds.hidden_all_three_each ?? 6;
      isUnlocked = (
        this.state.affinity.dakgalbi >= th &&
        this.state.affinity.yangnyeom >= th &&
        this.state.affinity.goguma >= th
      );
    } else {
      isUnlocked = this.state.reunion_temp >= (thresholds.reunion_temp ?? 10);
    }

    this.state.hiddenUnlocked = isUnlocked;

    // 분기 A (볶음밥 등장) 또는 분기 B (미등장)로 이동
    if (isUnlocked) {
      this.goToScene('s14_pier_sunset_a');
    } else {
      this.goToScene('s14_pier_sunset_b');
    }
  }

  // ─── s15 최종 선택 화면 (버튼 잠김 / 히든 노출) ─────────────────────────────

  _presentFinalChoice() {
    const th = this.config?.endingThresholds || { dakgalbi: 8, yangnyeom: 8, goguma: 8 };
    const options = [];

    // 1. 닭갈비
    const dakgalbiName = this.currentCharacters.dakgalbi.name;
    const dakgalbiOk = this.state.affinity.dakgalbi >= (th.dakgalbi ?? 8);
    options.push({
      text: `${dakgalbiName}에게 마음을 전한다`,
      disabled: !dakgalbiOk,
      lockedReason: "아직은 좋은 친구 사이",
      next: "ending_dakgalbi"
    });

    // 2. 양념
    const yangnyeomName = this.currentCharacters.yangnyeom.name;
    const yangnyeomOk = this.state.affinity.yangnyeom >= (th.yangnyeom ?? 8);
    options.push({
      text: `${yangnyeomName}에게 마음을 전한다`,
      disabled: !yangnyeomOk,
      lockedReason: "아직은 서로를 알아가는 중",
      next: "ending_yangnyeom"
    });

    // 3. 고구마
    const gogumaName = this.currentCharacters.goguma.name;
    const gogumaOk = this.state.affinity.goguma >= (th.goguma ?? 8);
    options.push({
      text: `${gogumaName}에게 마음을 전한다`,
      disabled: !gogumaOk,
      lockedReason: "아직은 편한 친구 사이",
      next: "ending_goguma"
    });

    // 4. 볶음밥 (히든 조건 충족 시에만 버튼 표시!)
    if (this.state.hiddenUnlocked) {
      const bokkeumbapName = this.currentCharacters.bokkeumbap.name;
      options.push({
        text: `${bokkeumbapName}에게 다가간다`,
        disabled: false,
        next: "ending_bokkeumbap"
      });
    }

    // 5. 혼자 돌아간다 (항상 활성)
    options.push({
      text: "혼자 돌아간다",
      disabled: false,
      next: "ending_alone"
    });

    this._presentChoices("당신의 마지막 마음을 전할 상대를 선택하세요.", options);
  }

  // ─── 선택지 팝업 및 선택 처리 ──────────────────────────────────────────────

  _presentChoices(question, options) {
    this.state.choiceActive = true;
    this._stopAutoTimer();
    this.state.isSkip = false;

    // 선택지 문구 내 변수 치환
    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || '다곡희',
      yangnyeom: this.currentCharacters.yangnyeom?.name || '양연미',
      goguma: this.currentCharacters.goguma?.name || '고규미',
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || '박복은',
    };

    const processedOptions = options.map(opt => ({
      ...opt,
      text: resolveTextVariables(opt.text, vars)
    }));

    if (this.ui) this.ui.setChoicesActive(true);
    if (this.renderer) {
      this.renderer.updateMenuBar(this.state.isAuto, this.state.isSkip);
      this.renderer.showChoices(question, processedOptions, (idx) => {
        this.selectChoice(options, idx);
      });
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

    // 특수 좌석 선택 기록 (s10_seat)
    if (this.state.sceneId === 's10_seat') {
      if (chosen.key === 'A') this.state.chosenSeat = 'dakgalbi';
      else if (chosen.key === 'B') this.state.chosenSeat = 'yangnyeom';
      else if (chosen.key === 'C') this.state.chosenSeat = 'goguma';
    }

    // Day 2 대상 선택 기록 (s07_day2)
    if (this.state.sceneId === 's07_day2') {
      if (chosen.key === 'A') this.state.day2Target = 'dakgalbi';
      else if (chosen.key === 'B') this.state.day2Target = 'yangnyeom';
      else if (chosen.key === 'C') this.state.day2Target = 'goguma';
    }

    // 다음 씬 이동 (s03 만남 후 s03_2 메시지 씬으로 자동 연결)
    if (chosen.next) {
      this.goToScene(chosen.next);
    } else if (['s03_lego', 's03_skywalk', 's03_myeongdong'].includes(this.state.sceneId)) {
      this.goToScene('s03_2_day1_messages');
    } else if (this.state.sceneId?.startsWith('s07_')) {
      this.goToScene('s08_day2_end');
    }
  }

  applyEffects(effects) {
    let delta = effects.score || 0;
    if (!delta && effects.scale && this.scoreScale) {
      delta = this.scoreScale[effects.scale] || 0;
    }

    // 현재 씬에 해당하는 캐릭터 판별
    let targetChar = null;
    if (this.state.sceneId.includes('dakgalbi') || this.state.sceneId === 's03_lego') targetChar = 'dakgalbi';
    else if (this.state.sceneId.includes('yangnyeom') || this.state.sceneId === 's03_myeongdong') targetChar = 'yangnyeom';
    else if (this.state.sceneId.includes('goguma') || this.state.sceneId === 's03_skywalk') targetChar = 'goguma';

    if (targetChar && delta) {
      this.state.affinity[targetChar] = (this.state.affinity[targetChar] || 0) + delta;
      const charName = this.currentCharacters[targetChar]?.name;

      if (this.settings.showAffinity && this.renderer) {
        this.renderer.showAffinityPopup(targetChar, delta, charName);
      }
    }

    // 고민 상태 업데이트
    if (targetChar && effects.troubleState) {
      this.state.troubleStates[targetChar] = effects.troubleState;
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
      if (!this.state.choiceActive) {
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
      { id: "ending_dakgalbi", title: `${dakgalbiName} 엔딩`, badge: "NORMAL", description: `${dakgalbiName}와의 호감도를 쌓아 맞이한 엔딩.` },
      { id: "ending_yangnyeom", title: `${yangnyeomName} 엔딩`, badge: "NORMAL", description: `${yangnyeomName}와의 호감도를 쌓아 맞이한 엔딩.` },
      { id: "ending_goguma", title: `${gogumaName} 엔딩`, badge: "NORMAL", description: `${gogumaName}와의 호감도를 쌓아 맞이한 엔딩.` },
      { id: "ending_bokkeumbap", title: `${bokkeumbapName} 히든 엔딩`, badge: "SECRET", description: `선착장에서 재회한 옛 연인 ${bokkeumbapName}와 맞이한 특별한 엔딩.` },
      { id: "ending_alone", title: "혼자 돌아가는 엔딩", badge: "SOLO", description: "아무도 붙잡지 않고 춘천을 떠나 혼자 일상으로 돌아가는 엔딩." },
    ];

    const achievedEndings = this.saveManager ? this.saveManager.loadAchievements() : new Set();
    return { allEndings, achievedEndings };
  }
}
