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

      // Day 2 마지막 2지선다 / Day 3 버스 2지선다 / Day 3 남이섬 2지선다
      if (sid.startsWith('s07_') && sid !== 's07_day2') {
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

  // 8) 항목 1: Day 1~2 12개 단일 버튼 (+2)/(0) 및 labelMode === 'up' 검증
  const expectedBtns = [
    ['s03_lego', [0, 2]],
    ['s03_skywalk', [2, 0]],
    ['s03_myeongdong', [2, 0]],
    ['s07_dakgalbi', [2, 0]],
    ['s07_goguma', [2, 0]],
    ['s07_yangnyeom', [2, 0]],
  ];
  for (const [sid, exp] of expectedBtns) {
    const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${sid}.json`), 'utf8'));
    const singles = sc.dialogues.filter(d => d.type === 'choice' && d.single);
    const pts = singles.map(s => {
      const like = s.options[0].effects?.like;
      return like ? Object.values(like)[0] : 0;
    });
    const labelsOk = singles.every(s => !s.options[0].effects || s.options[0].effects.labelMode === 'up');
    assert(JSON.stringify(pts) === JSON.stringify(exp) && labelsOk, `항목 1: ${sid} 단일 버튼 점수 ${JSON.stringify(pts)} === ${JSON.stringify(exp)} & labelMode='up'`);
  }

  // 9) 항목 2: 캐릭터 스프라이트 유지 (주인공 O.S./V.O./버튼 중 유지, '사라진다' 지문에서 해제)
  const s03Lego = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's03_lego.json'), 'utf8'));
  const btnOsLine = s03Lego.dialogues.find(d => d.speaker === '주인공' && d.speakerType === 'os' && d.text === '누구세요?');
  const vanishIdx = s03Lego.dialogues.findIndex(d => d.text && d.text.includes('사라진다'));
  assert(btnOsLine && btnOsLine.characters?.length === 1 && btnOsLine.characters[0].id === 'dakgalbi', '항목 2: [버튼] 주인공 대사 중 닭고기 스프라이트 유지됨');
  assert(vanishIdx > 0 && s03Lego.dialogues[vanishIdx].characters.length === 0, '항목 2: "사라진다" 지문에서 스프라이트 해제됨');

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

  console.log('\n====================================================');
  console.log(` 검증 결과: ${passed} / ${total} 테스트 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
  process.exit(passed === total ? 0 : 1);
})();
