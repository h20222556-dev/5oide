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
      day2Visited: [],             // Day 2 만난 캐릭터 목록 ['dakgalbi', 'goguma', ...]
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
          this.state.isTransitioning = true;
          if (this.renderer && typeof this.renderer.playDayTransition === 'function') {
            this.renderer.playDayTransition(1, "춘천에서의 첫 만남", () => {
              this.state.isTransitioning = false;
              this.goToScene('s01_prologue');
            });
          } else {
            this.state.isTransitioning = false;
            this.goToScene('s01_prologue');
          }
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
    this.state.reunion_temp = 0;
    this.state.troubleStates = { dakgalbi: null, yangnyeom: null, goguma: null };
    this.state.hiddenUnlocked = false;
    this.state.revealedSpeakers = new Set();
    this.state.day1Visited = [];
    this.state.day2Visited = [];
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
      day2Visited: [...this.state.day2Visited],
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
    this.state.day2Visited = [...(saved.day2Visited || [])];
    this.state.day2Target = saved.day2Target || null;
    this.state.chosenSeat = saved.chosenSeat || null;

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

    // 휴대폰 메시지 장면 (phone_message 타입) 특수 처리
    if (scene.type === 'phone_message') {
      this._renderPhoneMessageScene(scene);
      return;
    }

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
      양념: this.currentCharacters.yangnyeom?.name || '양연미',
      고구마: this.currentCharacters.goguma?.name || '고규미',
      볶음밥: this.currentCharacters.bokkeumbap?.name || '박복은',
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

    // (b) 화자 라벨이 실제 이름(또는 역할)으로 지정되어 있고 "???"가 아닌 경우
    for (const [cid, cData] of Object.entries(this.currentCharacters)) {
      if (d.speaker && (d.speaker.includes(cData.role) || d.speaker.includes(cData.name)) && !d.speaker.includes('???')) {
        if (!['s03_lego', 's03_skywalk', 's03_myeongdong'].includes(this.state.sceneId)) {
          this.state.revealedSpeakers.add(cid);
        } else if (hasRevealNotice || d.text.includes('제 이름은') || d.text.includes('입니다') || d.text.includes('이요')) {
          this.state.revealedSpeakers.add(cid);
        }
      }
    }

    // 안내 지문 제거
    if (processedText.includes('실제 이름으로 바뀜')) {
      processedText = processedText.replace(/\(←\s*이 대사부터[^\)]+\)/g, '').trim();
    }

    // 화자 이름 결정
    let speakerDisplayName = d.speaker;
    let speakerColor = null;

    if (d.speaker) {
      if (d.speaker.includes('나레이션') || d.speaker.includes('내레이션') || d.speakerType === 'narration') {
        speakerDisplayName = null;
      } else {
        let cleanSpeaker = d.speaker.replace(/\(V\.O\.\)|\(O\.S\.\)|\(속마음\)|\(화면\s*밖\)|\[화면\s*밖\]/g, '').trim();

        if (cleanSpeaker === '???') {
          const targetChar = d.characters && d.characters[0] ? d.characters[0].id : null;
          if (targetChar && this.currentCharacters[targetChar]) {
            if (this.state.revealedSpeakers.has(targetChar)) {
              speakerDisplayName = this.currentCharacters[targetChar].name;
              speakerColor = this.currentCharacters[targetChar].color;
            } else {
              speakerDisplayName = '???';
            }
          } else {
            speakerDisplayName = '???';
          }
        } else {
          let matched = false;
          for (const [cid, cData] of Object.entries(this.currentCharacters)) {
            if (cleanSpeaker.includes(cData.role) || cleanSpeaker.includes(cid) || cleanSpeaker.includes(cData.name)) {
              matched = true;
              speakerDisplayName = cData.name || (typeof getDisplayName === 'function' ? getDisplayName(cid, this.state.gender) : cData.role);
              speakerColor = cData.color;
              break;
            }
          }
          if (!matched && cleanSpeaker === '주인공') {
            speakerDisplayName = this.state.playerName;
          }
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

  // ─── 휴대폰 메시지 전용 렌더링 (V.O. 2줄 -> 말풍선 팝업 -> V.O. 1줄 -> 다음 씬) ───
  _renderPhoneMessageScene(scene) {
    const vars = {
      player: this.state.playerName,
      dakgalbi: this.currentCharacters.dakgalbi?.name || '다곡희',
      양념: this.currentCharacters.yangnyeom?.name || '양연미',
      고구마: this.currentCharacters.goguma?.name || '고규미',
      볶음밥: this.currentCharacters.bokkeumbap?.name || '박복은',
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

      const resolvedMsgs = (scene.messages || []).map(m => ({
        sender: m.sender,
        senderName: m.sender === 'player' ? this.state.playerName : partnerName,
        text: resolveTextVariables(m.text, vars)
      }));

      if (this.renderer) {
        this.renderer.startPhoneMessageSequence(partnerName, resolvedMsgs, () => {
          // 말풍선 완료 후 outro VO 대사로 진행
          this.state.dialogueIndex = 3;
          this._renderCurrentDialogue();
        });
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
      // 완료 후 s03_2_day1_messages 로 이동
      this.goToScene(scene.next || 's03_2_day1_messages');
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

    // 1. Day 1 메시지 및 남은 장소 씬 (s03_2_day1_messages)
    if (scene.id === 's03_2_day1_messages') {
      this._handleDay1RepeatBranch();
      return;
    }

    // 2. Day 1 다음 장소 반복 (s04_s05_day1_repeat)
    if (scene.id === 's04_s05_day1_repeat') {
      this._handleDay1RepeatBranch();
      return;
    }

    // 3. Day 2 첫 선택 또는 반복 선택 씬 (s07_day2)
    if (scene.id === 's07_day2') {
      this._presentDay2RemainingChoices();
      return;
    }

    // 4. Day 2 개별 인물 만남 종료 후 (선택지가 없는 경우의 안전한 폴백)
    if ((scene.id === 's07_dakgalbi' || scene.id === 's07_yangnyeom' || scene.id === 's07_goguma') && (!scene.choices || !scene.choices.options?.length)) {
      const cid = scene.id.replace('s07_', '');
      if (!this.state.day2Visited.includes(cid)) {
        this.state.day2Visited.push(cid);
      }
      if (this.state.day2Visited.length >= 3) {
        this.goToScene('s08_day2_end');
      } else {
        this.state.sceneId = 's07_day2';
        this._presentDay2RemainingChoices();
      }
      return;
    }

    // 5. 선착장 해질녘 판정 (s14_pier_sunset)
    if (scene.id === 's14_pier_sunset') {
      this._handlePierSunsetJudgement();
      return;
    }

    // 6. 분기 A/B 종료 후 -> s15_final_choice
    if (scene.id === 's14_pier_sunset_a' || scene.id === 's14_pier_sunset_b') {
      this.goToScene('s15_final_choice');
      return;
    }

    // 7. 최종 선택 화면 (s15_final_choice)
    if (scene.id === 's15_final_choice') {
      this._presentFinalChoice();
      return;
    }

    // 8. 엔딩 씬 대사 종료 후 -> 타이틀 복귀 버튼
    if (scene.type === 'ending') {
      this._presentChoices("이야기가 마무리되었습니다.", [
        { text: "타이틀 화면으로 돌아가기", next: "__TITLE__" }
      ]);
      return;
    }

    // 9. 일반 씬의 선택지가 있는 경우 (선택지 먼저 출력)
    if (scene.choices && scene.choices.options?.length > 0) {
      // Day 1 두 번째/세 번째 장소 선택지 동적 필터링
      if (scene.choices.id === 'place_1' || scene.choices.id === 'place_2') {
        this._presentDay1PlaceChoices(scene.choices);
        return;
      }
      if (scene.id === 's07_day2') {
        this._presentDay2RemainingChoices();
        return;
      }

      this._presentChoices(scene.choices.question, scene.choices.options);
      return;
    }

    // 10. 뱃길 대화 종료 후 -> 남이섬으로 연결 (선택지 없는 경우의 폴백)
    if (scene.id === 's11_dakgalbi') { this.goToScene('s12_dakgalbi'); return; }
    if (scene.id === 's11_yangnyeom') { this.goToScene('s12_yangnyeom'); return; }
    if (scene.id === 's11_goguma') { this.goToScene('s12_goguma'); return; }

    // 11. 남이섬 이벤트 종료 후 -> s14_pier_sunset (선택지 없는 경우의 폴백)
    if (scene.id === 's12_dakgalbi' || scene.id === 's12_yangnyeom' || scene.id === 's12_goguma') {
      this.goToScene('s14_pier_sunset');
      return;
    }

    // 12. DAY 전환 연출 (s06_day1_end -> DAY 2, s08_day2_end -> DAY 3)
    if (scene.id === 's06_day1_end') {
      this.state.isTransitioning = true;
      if (this.renderer && typeof this.renderer.playDayTransition === 'function') {
        this.renderer.playDayTransition(2, "조금씩 가까워지는 사이", () => {
          this.state.isTransitioning = false;
          this.goToScene('s07_day2');
        });
      } else {
        this.state.isTransitioning = false;
        this.goToScene('s07_day2');
      }
      return;
    }

    if (scene.id === 's08_day2_end') {
      this.state.isTransitioning = true;
      if (this.renderer && typeof this.renderer.playDayTransition === 'function') {
        this.renderer.playDayTransition(3, "남이섬으로 향하는 배", () => {
          this.state.isTransitioning = false;
          this.goToScene('s09_pier');
        });
      } else {
        this.state.isTransitioning = false;
        this.goToScene('s09_pier');
      }
      return;
    }

    // 13. 다음 씬이 지정되어 있으면 이동 (또는 기본 씬 연결 맵)
    const fallbackNextMap = {
      "s01_prologue": "s02_place_select",
      "s03_lego": "s03_lego_phone",
      "s03_lego_phone": "s03_2_day1_messages",
      "s03_skywalk": "s03_skywalk_phone",
      "s03_skywalk_phone": "s03_2_day1_messages",
      "s03_myeongdong": "s03_myeongdong_phone",
      "s03_myeongdong_phone": "s03_2_day1_messages",
      "s06_day1_end": "s07_day2",
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

  // ─── Day 1 & Day 2 순차 선택 핸들러 ─────────────────────────────────────────

  _handleDay1RepeatBranch() {
    // 3개 장소를 모두 방문했으면 Day 1 마무리(s06_day1_end)로 이동
    if (this.state.day1Visited.length >= 3) {
      this.goToScene('s06_day1_end');
      return;
    }

    // 남은 장소들로 동적 선택지 제시
    const allPlaces = [
      { key: 'lego', text: 'A: 레고랜드 — "다양한 놀이기구와 볼거리가 있는 테마파크"', next: 's03_lego' },
      { key: 'skywalk', text: 'B: 스카이워크 — "탁 트인 강 풍경을 감상할 수 있는 명소"', next: 's03_skywalk' },
      { key: 'myeongdong', text: 'C: 명동 닭갈비 골목 — "춘천의 대표 먹거리를 즐길 수 있는 거리"', next: 's03_myeongdong' },
    ];

    const available = allPlaces.filter(p => !this.state.day1Visited.includes(p.key));
    this._presentChoices("다음은! 여기다.", available);
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

    const options = allChars.map((c, idx) => {
      const charName = this.currentCharacters[c.id]?.name || (typeof getDisplayName === 'function' ? getDisplayName(c.id, this.state.gender) : c.role);
      const isVisited = this.state.day2Visited.includes(c.id);
      return {
        key: String.fromCharCode(65 + idx),
        charId: c.id,
        text: `${String.fromCharCode(65 + idx)}: ${charName}에게 연락한다`,
        disabled: isVisited,
        lockedReason: isVisited ? "연락 완료" : null,
        next: isVisited ? null : c.next
      };
    });

    const question = this.state.day2Visited.length === 0
      ? "누구에게 먼저 연락해볼까?"
      : "다음은 누구에게 연락해볼까?";

    this._presentChoices(question, options);
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
      dakgalbi: this.currentCharacters.dakgalbi?.name || '다곡희',
      yangnyeom: this.currentCharacters.yangnyeom?.name || '양연미',
      goguma: this.currentCharacters.goguma?.name || '고규미',
      bokkeumbap: this.currentCharacters.bokkeumbap?.name || '박복은',
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

    // Day 2 대상 선택 기록
    if (this.state.sceneId === 's07_day2') {
      let cid = chosen.charId;
      if (!cid) {
        if (chosen.key === 'A') cid = 'dakgalbi';
        else if (chosen.key === 'B') cid = 'yangnyeom';
        else if (chosen.key === 'C') cid = 'goguma';
      }
      if (cid) {
        this.state.day2Target = cid;
      }
    }

    // Day 2 개별 인물 만남(s07_dakgalbi, s07_yangnyeom, s07_goguma)에서 선택지 완료 후 분기
    if (this.state.sceneId === 's07_dakgalbi' || this.state.sceneId === 's07_yangnyeom' || this.state.sceneId === 's07_goguma') {
      const cid = this.state.sceneId.replace('s07_', '');
      if (!this.state.day2Visited.includes(cid)) {
        this.state.day2Visited.push(cid);
      }
      if (this.state.day2Visited.length >= 3) {
        this.goToScene('s08_day2_end');
      } else {
        this.state.sceneId = 's07_day2';
        this._presentDay2RemainingChoices();
      }
      return;
    }

    // 기본 씬 전환 맵 (chosen.next가 비어있을 때 fallback)
    const fallbackNextMap = {
      "s01_prologue": "s02_place_select",
      "s03_lego": "s03_lego_phone",
      "s03_lego_phone": "s03_2_day1_messages",
      "s03_skywalk": "s03_skywalk_phone",
      "s03_skywalk_phone": "s03_2_day1_messages",
      "s03_myeongdong": "s03_myeongdong_phone",
      "s03_myeongdong_phone": "s03_2_day1_messages",
      "s06_day1_end": "s07_day2",
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

    const currentScene = this.scenes.get(this.state.sceneId);
    let nextTarget = chosen.next || currentScene?.next || fallbackNextMap[this.state.sceneId];

    if (['s03_lego', 's03_skywalk', 's03_myeongdong'].includes(this.state.sceneId)) {
      nextTarget = `${this.state.sceneId}_phone`;
    }

    if (nextTarget) {
      this.goToScene(nextTarget);
    } else {
      console.warn(`[GameEngine] 다음 씬을 찾을 수 없습니다. 현재 씬: ${this.state.sceneId}`);
    }
  }

  applyEffects(effects) {
    let delta = effects.score || 0;
    if (!delta && effects.scale && this.scoreScale) {
      delta = this.scoreScale[effects.scale] || 0;
    }

    // 복수 캐릭터 수치 효과가 명시된 경우 (예: { dakgalbi: 2, yangnyeom: 2 })
    if (effects.characters) {
      for (const [cid, val] of Object.entries(effects.characters)) {
        if (this.state.affinity[cid] !== undefined) {
          this.state.affinity[cid] += val;
          const charName = this.currentCharacters[cid]?.name;
          if (this.settings.showAffinity && this.renderer) {
            this.renderer.showAffinityPopup(cid, val, charName);
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
