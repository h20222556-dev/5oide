/**
 * tools/verify_engine.js
 * 새 스토리(미연시_전체스토리_구현명세.md, v2_full_spec) 자동 검증 스크립트
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'game_config.json'), 'utf8'));
const characters = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'characters.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'assets_manifest.json'), 'utf8'));
const { resolveTextVariables, getDisplayName } = require(path.join(rootDir, 'js', 'utils.js'));

let passed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
  }
}

console.log('====================================================');
console.log('   오이데 새 스토리(v2_full_spec) 전체 검증 테스트   ');
console.log('====================================================');

// 1. 설정 및 에셋 매니페스트 검증
assert(config.storyVersion === 'v2_full_spec', 'game_config.storyVersion === v2_full_spec');
assert(config.SHOW_HUD === false, '우측 상단 HUD 숨김 플래그 SHOW_HUD === false');
assert(config.LIKE_THRESHOLD === 8, '호감도 판정 기준치 LIKE_THRESHOLD === 8');
assert(config.endingThresholds.dakgalbi === 8 && config.endingThresholds.yangnyeom === 8 && config.endingThresholds.goguma === 8, '엔딩 기준치 3명 모두 8점');

// 실제 파일 존재 검증 (매니페스트의 모든 경로)
for (const [k, rel] of Object.entries(manifest.backgrounds)) {
  assert(fs.existsSync(path.join(rootDir, rel)), `배경 에셋 파일 존재: ${k} -> ${rel}`);
}
for (const [cid, table] of Object.entries(manifest.characters.male)) {
  for (const [expr, rel] of Object.entries(table)) {
    assert(fs.existsSync(path.join(rootDir, rel)), `남성 스프라이트 존재: ${cid}.${expr} -> ${rel}`);
  }
}

// 2. 이전 스토리 잔존 여부 검증
const sceneFiles = fs.readdirSync(path.join(rootDir, 'data', 'scenes')).filter(f => f.endsWith('.json'));
const oldScenes = ['s10_1_video.json', 's10_2_seat.json', 's11_1_arrive.json', 's11_2_place.json', 's13_sunset.json', 's14_pier_sunset.json', 's15_final_choice.json', 'scene_start.json'];
for (const old of oldScenes) {
  assert(!sceneFiles.includes(old), `이전 스토리 씬 삭제됨: ${old}`);
}

// 3. 성별 이름 치환 & 조사 검증 (전 장면 누출/대괄호/점수표기 없음)
for (const g of ['male', 'female']) {
  const other = g === 'male' ? 'female' : 'male';
  const names = {
    player: '테스터',
    dakgalbi: characters[g].dakgalbi.name,
    yangnyeom: characters[g].yangnyeom.name,
    goguma: characters[g].goguma.name,
    bokkeumbap: characters[g].bokkeumbap.name,
  };
  const otherNames = Object.values(characters[other]).map(c => c.name);
  let leaks = [];
  const check = (txt, where) => {
    if (typeof txt !== 'string') return;
    const out = resolveTextVariables(txt, names);
    for (const on of otherNames) if (out.includes(on)) leaks.push(`${where}:${on}`);
    if (/\[(닭고기|닭갈비|양념|고구마|볶음밥|주인공)\]/.test(out)) leaks.push(`${where}:bracket`);
    if (/\{(닭갈비|양념|고구마|볶음밥|player)/.test(out)) leaks.push(`${where}:brace`);
    if (/\(\+\d+\)|\(0\)/.test(out)) leaks.push(`${where}:score`);
  };
  for (const f of sceneFiles) {
    const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', f), 'utf8'));
    (sc.dialogues || []).forEach((d, i) => {
      check(d.text, `${f}#${i}`);
      if (d.type === 'choice') {
        (d.options || []).forEach((o, j) => {
          check(o.text, `${f}#${i}.opt${j}`);
          (o.followUp || []).forEach(u => check(u.text, `${f}#${i}.fu`));
        });
      }
    });
    (sc.messages || []).forEach((m, i) => check(m.text, `${f}.msg${i}`));
    (sc.choices?.options || []).forEach((o, j) => {
      check(o.text, `${f}.ch${j}`);
      (o.followUp || []).forEach(u => check(u.text, `${f}.ch.fu`));
    });
  }
  assert(leaks.length === 0, `${g} 성별: 전 장면 대괄호/반대성별/점수표기 누출 없음 (${leaks.slice(0, 3).join(', ')})`);
}

// 슬래시 조사 자동 교정 검증
assert(resolveTextVariables('[닭고기]은/는', { dakgalbi: '다곡희' }) === '다곡희는', '슬래시 조사(여성): [닭고기]은/는 -> 다곡희는');
assert(resolveTextVariables('[닭고기]은/는', { dakgalbi: '다고길' }) === '다고길은', '슬래시 조사(남성): [닭고기]은/는 -> 다고길은');

// 4. 런타임 전체 시뮬레이션 (엔딩 6종, 좌석 3종, 호감도 8점 판정, 히든 조건, 세이브 버전, 자동/스킵 정지)
const utilsCode = fs.readFileSync(path.join(rootDir, 'js', 'utils.js'), 'utf8');
const engineCode = fs.readFileSync(path.join(rootDir, 'js', 'engine.js'), 'utf8');

async function runPlaythrough({ gender = 'male', seat = 'dakgalbi', day2Idx = 0, busIdx = 0, islandIdx = 0, finalTarget = null, bokOpt = 0 }) {
  const sandbox = { console, setTimeout, clearTimeout, alert: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(utilsCode, sandbox);
  sandbox.loadJSON = async (p) => JSON.parse(fs.readFileSync(path.join(rootDir, p), 'utf8'));
  vm.runInContext(engineCode + '\nthis.GameEngine = GameEngine;', sandbox);

  const engine = new sandbox.GameEngine();
  let lastChoices = null;
  let lastFeedbacks = [];
  let visitedScenes = [];
  let sawNextPlaceAfterThird = false;
  let singleChoiceAlwaysOne = true;
  let stopOk = true;

  const mockRenderer = {
    setAssetManifest() {},
    setHudVisible() {},
    hideChoices() { lastChoices = null; },
    hidePhoneMessages() {},
    setBackground() {},
    setTime() {},
    updateDebugPanel() {},
    showCG() {},
    setAffinityVisible() {},
    updateMenuBar() {},
    updateAffinityBar() {},
    showLikeFeedback(id, name, delta, prev, next, compact) { lastFeedbacks.push({ id, delta, compact }); },
    setSpeaker() {},
    setDialogueStyle() {},
    setCharacters() {},
    startTyping(text, speed, cb) { if (cb) cb(); },
    completeTyping() {},
    showScreen() {},
    startPhoneMessageSequence(partner, msgs, cb) { if (cb) cb(); },
    playDayTransition(day, sub, onComplete, onSwitch) { if (onSwitch) onSwitch(); if (onComplete) onComplete(); },
    showChoices(q, opts, onSelect) { lastChoices = { q, opts, onSelect }; },
  };

  await engine.init();
  engine.setRenderer(mockRenderer);
  engine.state.gender = gender;
  engine.state.playerName = '테스터';
  engine._initNewGameState();
  engine.goToScene('s01_prologue', 0);

  let steps = 0;
  let finalOptions = null;
  let reachedEnding = null;

  while (steps++ < 2500) {
    const sid = engine.state.sceneId;
    if (!visitedScenes.length || visitedScenes[visitedScenes.length - 1] !== sid) {
      visitedScenes.push(sid);
    }
    if (sid === 's03_2_day1_messages' && engine.state.day1Visited.length >= 3) {
      sawNextPlaceAfterThird = true;
    }

    if (engine.state.choiceActive && lastChoices) {
      if (engine.state.isSkip !== false || engine._autoTimer !== null) stopOk = false;
      const curScene = engine.scenes.get(sid);
      if (curScene && curScene.type === 'ending') {
        reachedEnding = sid;
        break;
      }

      if (sid === 's12_final_choice') {
        finalOptions = lastChoices.opts;
        const targetIdx = lastChoices.opts.findIndex(o => o.next === finalTarget && !o.disabled);
        if (targetIdx < 0) throw new Error(`Final target ${finalTarget} not selectable in ${JSON.stringify(finalOptions.map(o => ({ next: o.next, disabled: o.disabled })))}`);
        lastChoices.onSelect(targetIdx);
        continue;
      }

      if (sid === 's10_bus') {
        const idx = lastChoices.opts.findIndex(o => o.charId === seat);
        lastChoices.onSelect(idx);
        continue;
      }

      if (sid === 'ending_bokkeumbap_intro') {
        lastChoices.onSelect(bokOpt);
        continue;
      }

      if (lastChoices.opts.length === 1) {
        lastChoices.onSelect(0);
        continue;
      }

      // Day 1~2 대화 속 2지선다 / Day 2 마지막 2지선다 / Day 3 버스 2지선다 / Day 3 남이섬 2지선다
      if (sid === 's03_lego' || sid === 's03_skywalk' || sid === 's03_myeongdong') {
        const highIdx = lastChoices.opts.findIndex(o => o.effects?.like);
        const lowIdx = lastChoices.opts.findIndex(o => !o.effects?.like);
        lastChoices.onSelect(day2Idx === 0 ? highIdx : lowIdx);
      } else if (sid.startsWith('s07_') && sid !== 's07_day2') {
        lastChoices.onSelect(day2Idx);
      } else if (sid.startsWith('s10_bus_')) {
        lastChoices.onSelect(busIdx);
      } else if (sid.startsWith('s11_')) {
        lastChoices.onSelect(islandIdx);
      } else {
        lastChoices.onSelect(0);
      }
      continue;
    }

    engine.state.isSkip = true;
    engine.nextDialogue();
  }

  return { engine, visitedScenes, finalOptions, reachedEnding, sawNextPlaceAfterThird, singleChoiceAlwaysOne, stopOk, lastFeedbacks };
}

(async () => {
  // 1) 닭고기 엔딩 (남성, 고득점: bus +2, island +2 -> 10점)
  const rDak = await runPlaythrough({ gender: 'male', seat: 'dakgalbi', day2Idx: 0, busIdx: 0, islandIdx: 0, finalTarget: 'ending_dakgalbi' });
  assert(rDak.reachedEnding === 'ending_dakgalbi', `닭고기 엔딩 도달 (affinity=${JSON.stringify(rDak.engine.state.affinity)})`);
  assert(!rDak.visitedScenes.includes('s12_hidden_bokkeumbap'), '닭고기 8점 이상: 볶음밥 등장 장면 미출력');
  assert(!rDak.finalOptions.some(o => o.next === 'ending_bokkeumbap_intro'), '닭고기 8점 이상: 최종 선택에 볶음밥 버튼 없음');
  assert(rDak.finalOptions.filter(o => o.disabled).length === 2, '닭고기 8점 이상: 나머지 2명 잠금');
  assert(!rDak.visitedScenes.includes('s11_yangnyeom') && !rDak.visitedScenes.includes('s11_goguma'), '#10 닭고기 좌석 -> #11 메타세쿼이아길만 진행');
  assert(!rDak.sawNextPlaceAfterThird, 'Day 1 3번째 장소 후 "다음 장소로 이동해 볼까?" 미출력');
  assert(rDak.stopOk, '선택지에서 자동/스킵 정지 확인');

  // 2) 양념 엔딩 (여성, busIdx=1(+2), islandIdx=0(+2) -> 10점)
  const rYang = await runPlaythrough({ gender: 'female', seat: 'yangnyeom', day2Idx: 0, busIdx: 1, islandIdx: 0, finalTarget: 'ending_yangnyeom' });
  assert(rYang.reachedEnding === 'ending_yangnyeom', `양념 엔딩 도달 (여성판, affinity=${JSON.stringify(rYang.engine.state.affinity)})`);
  assert(!rYang.visitedScenes.includes('s12_hidden_bokkeumbap'), '양념 8점 이상: 볶음밥 미등장');
  assert(!rYang.visitedScenes.includes('s11_dakgalbi') && !rYang.visitedScenes.includes('s11_goguma'), '#10 양념 좌석 -> #11 호숫가 산책로만 진행');

  // 3) 고구마 엔딩 (남성, busIdx=0(+2), islandIdx=1(+2) -> 10점)
  const rGog = await runPlaythrough({ gender: 'male', seat: 'goguma', day2Idx: 0, busIdx: 0, islandIdx: 1, finalTarget: 'ending_goguma' });
  assert(rGog.reachedEnding === 'ending_goguma', `고구마 엔딩 도달 (affinity=${JSON.stringify(rGog.engine.state.affinity)})`);
  assert(!rGog.visitedScenes.includes('s12_hidden_bokkeumbap'), '고구마 8점 이상: 볶음밥 미등장');
  assert(!rGog.visitedScenes.includes('s11_dakgalbi') && !rGog.visitedScenes.includes('s11_yangnyeom'), '#10 고구마 좌석 -> #11 은행나무길만 진행');

  // 4) 볶음밥 재회 엔딩 (세 명 모두 < 8: day2Idx=1(+1), busIdx=1(+1), islandIdx=1(0) -> 6점)
  const rBok1 = await runPlaythrough({ gender: 'male', seat: 'dakgalbi', day2Idx: 1, busIdx: 1, islandIdx: 1, finalTarget: 'ending_bokkeumbap_intro', bokOpt: 0 });
  assert(rBok1.visitedScenes.includes('s12_hidden_bokkeumbap'), '세 명 모두 < 8: 볶음밥 등장 장면 재생됨');
  assert(rBok1.finalOptions.some(o => o.next === 'ending_bokkeumbap_intro' && !o.disabled), '세 명 모두 < 8: 볶음밥 버튼 활성');
  assert(rBok1.finalOptions.filter(o => o.disabled).length === 3, '세 명 모두 < 8: 세 캐릭터 모두 잠금');
  assert(rBok1.reachedEnding === 'ending_bokkeumbap_reunion', `볶음밥 재회 엔딩 도달 (affinity=${JSON.stringify(rBok1.engine.state.affinity)})`);

  // 5) 볶음밥 노멀 엔딩 ("미안.")
  const rBok2 = await runPlaythrough({ gender: 'female', seat: 'goguma', day2Idx: 1, busIdx: 1, islandIdx: 0, finalTarget: 'ending_bokkeumbap_intro', bokOpt: 1 });
  assert(rBok2.reachedEnding === 'ending_bokkeumbap_normal', `볶음밥 노멀 엔딩 도달 (affinity=${JSON.stringify(rBok2.engine.state.affinity)})`);

  // 6) 혼자 돌아가기 엔딩
  const rAlone = await runPlaythrough({ gender: 'male', seat: 'dakgalbi', day2Idx: 0, busIdx: 0, islandIdx: 0, finalTarget: 'ending_alone' });
  assert(rAlone.reachedEnding === 'ending_alone', '혼자 돌아가기 엔딩 도달');

  // 7) 이전 스토리 세이브 버전 호환 차단 검증
  const oldSaveRes = rAlone.engine.loadState({ sceneId: 's01_prologue', dialogueIndex: 0 });
  assert(oldSaveRes === false, 'storyVersion 없는 구버전 세이브 로드 차단됨');

  // 8) Day 1~2 6개 대화 화면: 동시 2지선다 (+2/0, labelMode='up') + 각 선택지 A/B 분기 및 공통 합류 검증
  const expectedPairs = [
    ['s03_lego', 'dakgalbi', [0, 2], '그럼, 혹시 관광 홍보 활동하시는 분이신가요?'],
    ['s03_skywalk', 'goguma', [2, 0], '그러고 보니 아직 자기소개도 못했네요.'],
    ['s03_myeongdong', 'yangnyeom', [2, 0], '그런데 성함이 어떻게 되세요?'],
    ['s07_dakgalbi', 'dakgalbi', [2, 0], '그럼 {닭갈비}씨의 속은 어떤데요?'],
    ['s07_goguma', 'goguma', [2, 0], '{고구마}씨는 항상 여유롭고 다정하신 것 같아요.'],
    ['s07_yangnyeom', 'yangnyeom', [2, 0], '{양념}씨는 춘천을 정말 잘 아시는 것 같아요.'],
  ];
  for (const [sid, cid, exp, mergeText] of expectedPairs) {
    const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${sid}.json`), 'utf8'));
    const pairIdx = sc.dialogues.findIndex(d => d.type === 'choice');
    const pair = sc.dialogues[pairIdx];
    const pts = pair.options.map(o => (o.effects?.like ? o.effects.like[cid] : 0));
    const labelsOk = pair.options.every(o => !o.effects || o.effects.labelMode === 'up');
    const nextMerge = sc.dialogues[pairIdx + 1];
    assert(pair && pair.options.length === 2 && !pair.single, `${sid} 첫 대화 선택지가 동시 2지선다로 구성됨`);
    assert(JSON.stringify(pts) === JSON.stringify(exp) && labelsOk, `${sid} 2지선다 점수 ${JSON.stringify(pts)} === ${JSON.stringify(exp)} & labelMode='up'`);
    assert(nextMerge && nextMerge.text === mergeText, `${sid} 선택지 직후 공통 합류 대사 일치`);
    // A/B 각 선택지 런타임 테스트: 고르지 않은 쪽 응답 미재생 + 점수 정확히 1회 가산 + 공통 합류 도달
    for (let optIdx = 0; optIdx < 2; optIdx++) {
      const otherIdx = 1 - optIdx;
      const pickDistinct = (fu) => (fu.slice(1).map(u => u.text).sort((a, b) => b.length - a.length)[0] || '');
      const otherUniqueResp = pickDistinct(pair.options[otherIdx].followUp);
      const chosenResp = pickDistinct(pair.options[optIdx].followUp);
      const sb = { console, setTimeout, clearTimeout, alert: () => {} };
      vm.createContext(sb);
      vm.runInContext(utilsCode, sb);
      sb.loadJSON = async (p) => JSON.parse(fs.readFileSync(path.join(rootDir, p), 'utf8'));
      vm.runInContext(engineCode + '\nthis.GameEngine = GameEngine;', sb);
      const eng = new sb.GameEngine();
      let ch = null;
      let playedTexts = [];
      let fbLabels = [];
      await eng.init();
      eng.setRenderer({
        setAssetManifest() {}, setHudVisible() {}, hideChoices() { ch = null; }, hidePhoneMessages() {},
        hideChatList() {}, hidePromoBillboard() {}, setBackground() {}, setTime() {}, updateDebugPanel() {},
        showCG() {}, setAffinityVisible() {}, updateMenuBar() {}, updateAffinityBar() {},
        preloadBackground() {}, preloadCharacterSprites() {},
        showLikeFeedback(id, name, delta, prev, next, compact, labelMode) { fbLabels.push({ delta, labelMode }); },
        setSpeaker() {}, setDialogueStyle() {}, setCharacters() {},
        startTyping(t, sp, cb) { playedTexts.push(t); if (cb) cb(); },
        completeTyping() {}, showScreen() {},
        showChoices(q, opts, onSel) { ch = { q, opts, onSel }; },
      });
      eng.state.gender = 'male';
      eng.state.playerName = '테스터';
      eng._initNewGameState();
      eng.goToScene(sid, 0);
      let g = 0;
      let picked = false;
      while (eng.state.sceneId === sid || eng.state.sceneId === '__followup__') {
        if (g++ > 120) break;
        if (eng.state.choiceActive && ch) {
          if (!picked) {
            picked = true;
            ch.onSel(optIdx);
          } else {
            break; // Day 2 두 번째 선택지(고민 2지선다) 도달 시 종료
          }
          continue;
        }
        eng.nextDialogue();
      }
      const expectedScore = exp[optIdx];
      assert(eng.state.affinity[cid] === expectedScore, `${sid} 옵션 ${optIdx} 선택 -> 호감도 ${eng.state.affinity[cid]} === ${expectedScore} (이중 가산 없음)`);
      assert(!playedTexts.some(t => otherUniqueResp && t.includes(otherUniqueResp.slice(0, 10))), `${sid} 옵션 ${optIdx} 선택 -> 고르지 않은 응답 미재생`);
      assert(playedTexts.some(t => chosenResp && t.includes(chosenResp.slice(0, 10))), `${sid} 옵션 ${optIdx} 선택 -> 고른 응답 정상 재생`);
      if (expectedScore > 0) {
        assert(fbLabels.length === 1 && fbLabels[0].labelMode === 'up', `${sid} 옵션 ${optIdx} (+2) -> '상승했다' 피드백 1회`);
      } else {
        assert(fbLabels.length === 0, `${sid} 옵션 ${optIdx} (0) -> 피드백 미표시`);
      }
    }
  }

  // 9) 항목 2: 캐릭터 스프라이트 유지 (선택한 주인공 대사 중 유지, '사라진다' 지문에서 해제)
  const s03Lego = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's03_lego.json'), 'utf8'));
  const legoChoice = s03Lego.dialogues.find(d => d.type === 'choice');
  const btnOsLine = legoChoice.options[0].followUp[0];
  const vanishIdx = s03Lego.dialogues.findIndex(d => d.text && d.text.includes('사라진다'));
  assert(btnOsLine && btnOsLine.speaker === '주인공' && btnOsLine.characters?.length === 1 && btnOsLine.characters[0].id === 'dakgalbi', '항목 2: 선택 직후 주인공 대사 중 닭고기 스프라이트 유지됨');
  assert(vanishIdx > 0 && s03Lego.dialogues[vanishIdx].characters.length === 0, '항목 2: "사라진다" 지문에서 스프라이트 해제됨');

  // 엔딩 단일 버튼 유지 확인
  for (const edId of ['ending_dakgalbi', 'ending_yangnyeom', 'ending_goguma']) {
    const ed = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${edId}.json`), 'utf8'));
    const singles = ed.dialogues.filter(d => d.type === 'choice' && d.single && d.options.length === 1);
    assert(singles.length === 1, `${edId} 엔딩 단일 버튼 1개 그대로 유지됨`);
  }

  // 10) 항목 3: Day 2 고구마 루트 bg_cafe만 사용 (카페 입구 없음)
  const s07Gog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_goguma.json'), 'utf8'));
  const gogBgs = new Set([s07Gog.background, ...s07Gog.dialogues.map(d => d.background).filter(Boolean)]);
  assert(gogBgs.size === 1 && gogBgs.has('bg_cafe'), `항목 3: s07_goguma 배경이 bg_cafe만 사용됨 (${[...gogBgs].join(',')})`);

  // 11) 항목 8: #6, #7, #8 채팅 목록 코드 UI 속성 존재 확인
  const s06 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's06_day1_end.json'), 'utf8'));
  const s07 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_day2.json'), 'utf8'));
  const s08 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's08_day2_end.json'), 'utf8'));
  assert(s06.dialogues.some(d => d.chatList === 'day1'), '항목 8: #6에 코드 채팅 목록(day1) 연결됨');
  assert(s07.dialogues.some(d => d.chatList === 'day1'), '항목 8: #7에 코드 채팅 목록(day1) 연결됨');
  assert(s08.dialogues.some(d => d.chatList === 'day2_step1') && s08.dialogues.some(d => d.chatList === 'day2_step3'), '항목 8: #8에 순차 도착 채팅 목록(day2_step1~3) 연결됨');

  // 12) 작업 1, 3, 4, 6 검증: 선택지 이미지 숨김, 폰 UI 비율 상수, 전환 모드, 화자 이름 색 비중복 및 대비 4.5:1 이상
  assert(config.SHOW_CHOICE_IMAGES === false, '작업 1: SHOW_CHOICE_IMAGES 기본값 === false');
  assert(config.SHOW_LIKE_FEEDBACK === true, '호감도 게이지: SHOW_LIKE_FEEDBACK 기본값 === true');
  assert(config.PHONE_ASPECT_WIDTH === 9 && config.PHONE_ASPECT_HEIGHT === 19.5, '작업 3: PHONE_ASPECT_WIDTH=9, PHONE_ASPECT_HEIGHT=19.5');
  assert(config.TRANSITION_MODE === 'cut', '작업 4: TRANSITION_MODE 기본값 === cut');
  const hexToLum = (hex) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const contrastRatio = (fg, bg) => {
    const l1 = hexToLum(fg), l2 = hexToLum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const speakerPalette = {
    '주인공': '#FF9ECD',
    '닭갈비': characters.male.dakgalbi.color,
    '양념': characters.male.yangnyeom.color,
    '고구마': characters.male.goguma.color,
    '볶음밥': characters.male.bokkeumbap.color,
    '안내방송': '#74C0FC',
    '관광객': '#8CE99A',
    '???': '#CED4DA',
  };
  const uniqueColors = new Set(Object.values(speakerPalette).map(c => c.toUpperCase()));
  assert(uniqueColors.size === Object.keys(speakerPalette).length, '작업 6: 모든 화자 이름 색이 서로 중복되지 않음');
  for (const [sp, col] of Object.entries(speakerPalette)) {
    const cr = contrastRatio(col, '#0A0A14');
    assert(cr >= 4.5, `작업 6: ${sp}(${col}) 대사창 대비 ${cr.toFixed(2)}:1 >= 4.5:1`);
  }

  // 13) 호감도 게이지 음수 허용 + SaveManager 메타/챕터 매핑/레거시 호환/용량 초과 처리 검증
  const saveCode = fs.readFileSync(path.join(rootDir, 'js/save.js'), 'utf8');
  const mockStore = {};
  const saveSb = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mockStore, k) ? mockStore[k] : null),
      setItem: (k, v) => { mockStore[k] = String(v); },
      removeItem: (k) => { delete mockStore[k]; },
    },
  };
  vm.createContext(saveSb);
  vm.runInContext(saveCode + '\nthis.SaveManager = SaveManager;', saveSb);
  const SM = saveSb.SaveManager;
  assert(SM.resolveChapterLabel('s01_prologue', 'bg_train_window') === '프롤로그', '챕터 매핑: 프롤로그');
  assert(SM.resolveChapterLabel('s03_lego', 'bg_legoland') === 'DAY 1 · 레고랜드', '챕터 매핑: DAY 1 · 레고랜드');
  assert(SM.resolveChapterLabel('s07_day2', null) === 'DAY 2 · 가까워지는 시간', '챕터 매핑: DAY 2 기본');
  assert(SM.resolveChapterLabel('s07_goguma', 'bg_cafe') === 'DAY 2 · 카페', '챕터 매핑: DAY 2 · 카페');
  assert(SM.resolveChapterLabel('s10_bus', 'bg_nami_boat_interior') === 'DAY 3 · 수상버스', '챕터 매핑: DAY 3 · 수상버스');
  assert(SM.resolveChapterLabel('s11_dakgalbi', 'bg_metasequoia_road') === 'DAY 3 · 메타세쿼이아길', '챕터 매핑: DAY 3 · 메타세쿼이아길');
  assert(SM.resolveChapterLabel('s12_final_choice', 'bg_pier') === 'DAY 3 · 선택', '챕터 매핑: DAY 3 · 선택');
  assert(SM.resolveChapterLabel('ending_dakgalbi', 'bg_pier') === '엔딩', '챕터 매핑: 엔딩');

  const sm = new SM();
  const savedOk = sm.save(1, {
    storyVersion: 'v2_full_spec',
    gender: 'male',
    playerName: '테스터',
    sceneId: 's03_lego',
    dialogueIndex: 5,
    affinity: { dakgalbi: -1, yangnyeom: 2, goguma: 0 },
    bgKey: 'bg_legoland',
    spriteKeys: [{ id: 'dakgalbi', expression: '기본', position: 'center' }],
  });
  assert(savedOk === true, 'SaveManager.save() 정상 저장');
  // 메타 정보 없는 이전 저장 데이터(동일 스토리 버전)
  mockStore['oidate_save_2'] = JSON.stringify({
    slot: 2,
    timestamp: 1700000000000,
    storyVersion: 'v2_full_spec',
    gender: 'female',
    playerName: '구데이터',
    sceneId: 's01_prologue',
    dialogueIndex: 2,
    affinity: { dakgalbi: 0, yangnyeom: 0, goguma: 0 },
  });
  // 이전 스토리 버전 저장 데이터
  mockStore['oidate_save_3'] = JSON.stringify({
    slot: 3,
    timestamp: 1690000000000,
    storyVersion: 'v1_old',
    gender: 'female',
    playerName: '구버전',
    sceneId: 's01_prologue',
    dialogueIndex: 0,
  });
  const slots = sm.listSlots();
  assert(slots[0].chapterLabel === 'DAY 1 · 레고랜드' && slots[0].bgKey === 'bg_legoland' && slots[0].spriteKeys.length === 1, '신규 슬롯 메타 정보 정상 포함');
  assert(slots[1].chapterLabel === '저장된 데이터' && slots[1].date === '저장 시각 정보 없음' && !slots[1].isVersionMismatch, '메타 없는 이전 저장 데이터 호환 표시');
  assert(slots[2].isVersionMismatch === true, '이전 스토리 버전 슬롯 isVersionMismatch === true');
  assert(sm.load(1).affinity.dakgalbi === -1, '음수 호감도 저장/불러오기 보존');

  // 디자인 팔레트 대비 검증 (4.5:1 이상)
  assert(contrastRatio('#70435F', '#FFFDFB') >= 4.5, '팔레트 대비: --plum on --ivory >= 4.5:1');
  assert(contrastRatio('#70435F', '#FBE5ED') >= 4.5, '팔레트 대비: --plum on --pink-soft >= 4.5:1');
  assert(contrastRatio('#70435F', '#F8C9DA') >= 4.5, '팔레트 대비: --plum on --pink-tag-bg >= 4.5:1');
  assert(contrastRatio('#6B6178', '#FFFDFB') >= 4.5, '팔레트 대비: --gray-violet-text on --ivory >= 4.5:1');
  assert(contrastRatio('#6B6178', '#EEE9FA') >= 4.5, '팔레트 대비: --gray-violet-text on --lavender-soft >= 4.5:1');
  assert(contrastRatio('#4A253D', '#F4A9C4') >= 4.5, '팔레트 대비: --plum-dark on --pink-main >= 4.5:1');

  // 14) 상단 시스템 버튼 6개 개별 이미지(1x/2x) 존재 및 용량(<=150KB) 검증
  for (const key of ['save', 'load', 'settings', 'title', 'auto', 'skip']) {
    const p1 = path.join(rootDir, 'assets', 'ui', `ui_btn_${key}.png`);
    const p2 = path.join(rootDir, 'assets', 'ui', `ui_btn_${key}@2x.png`);
    assert(fs.existsSync(p1), `툴바 버튼 1x 이미지 존재: ui_btn_${key}.png`);
    assert(fs.existsSync(p2), `툴바 버튼 2x 이미지 존재: ui_btn_${key}@2x.png`);
    assert(fs.statSync(p2).size <= 150 * 1024, `툴바 버튼 2x 용량 <= 150KB: ui_btn_${key}@2x.png (${(fs.statSync(p2).size / 1024).toFixed(1)}KB)`);
  }

  // 15) 타이틀 메뉴 버튼 4개 개별 이미지(1x/2x) 존재 및 용량(<=250KB) 검증
  for (const key of ['start', 'load', 'records', 'settings']) {
    const p1 = path.join(rootDir, 'assets', 'ui', `ui_menu_${key}.png`);
    const p2 = path.join(rootDir, 'assets', 'ui', `ui_menu_${key}@2x.png`);
    assert(fs.existsSync(p1), `타이틀 메뉴 1x 이미지 존재: ui_menu_${key}.png`);
    assert(fs.existsSync(p2), `타이틀 메뉴 2x 이미지 존재: ui_menu_${key}@2x.png`);
    assert(fs.statSync(p2).size <= 250 * 1024, `타이틀 메뉴 2x 용량 <= 250KB: ui_menu_${key}@2x.png (${(fs.statSync(p2).size / 1024).toFixed(1)}KB)`);
  }

  console.log('\n====================================================');
  console.log(` 검증 결과: ${passed} / ${total} 테스트 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
  process.exit(passed === total ? 0 : 1);
})();
