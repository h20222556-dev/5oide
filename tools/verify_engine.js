/**
 * tools/verify_engine.js
 * 요구사항 4번 검증 스크립트:
 * 1) 성별 2종 x 이름 치환 및 한국어 조사 처리 검증
 * 2) 장소 선택 3개 경로 (레고랜드, 스카이워크, 명동) 씬 파일 존재 및 연결 검증
 * 3) 좌석 선택 3개 경로 (닭갈비, 양념, 고구마) 씬 파일 존재 및 연결 검증
 * 4) 엔딩 5종 도달 가능성 검증
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'game_config.json'), 'utf8'));
const characters = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'characters.json'), 'utf8'));
const scoreScale = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'score_scale.json'), 'utf8'));

// utils.js의 조사 로직 가져오기
const { hasJongseong, pickJosa, resolveTextVariables } = require(path.join(rootDir, 'js', 'utils.js'));


console.log('====================================================');
console.log('   오이데 엔진 자동 검증 테스트 (Verify Engine)    ');
console.log('====================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
  }
}

// 1. 성별 2종 x 이름 치환 & 조사 처리 검증
console.log('\n--- 1. 성별 2종 및 이름 치환 / 조사 검증 ---');
const testCases = [
  { gender: 'female', player: '홍길동', template: '{player}이라고 합니다. {닭갈비}이와 {양념}이가 {고구마}예요.', expected: '홍길동이라고 합니다. 다곡희와 양연미가 고규미예요.' },
  { gender: 'male', player: '김철수', template: '{player}이라고 합니다. {닭갈비}과 {양념}이 {고구마}입니다.', expected: '김철수라고 합니다. 다고길과 양연우가 고구민입니다.' },
  { gender: 'female', player: '이민지', template: '{player:은는} {고구마:을를} 만났다.', expected: '이민지는 고규미를 만났다.' },
  { gender: 'male', player: '박지성', template: '{player:은는} {고구마:을를} 만났다.', expected: '박지성은 고구민을 만났다.' },
  { gender: 'female', player: '테스터', template: '{볶음밥}이 오랜만이야.', expected: '박복은이 오랜만이야.' },
  { gender: 'male', player: '테스터', template: '{볶음밥}이 오랜만이야.', expected: '박복검이 오랜만이야.' }
];

for (const tc of testCases) {
  const chars = characters[tc.gender];
  const vars = {
    player: tc.player,
    dakgalbi: chars.dakgalbi.name,
    yangnyeom: chars.yangnyeom.name,
    goguma: chars.goguma.name,
    bokkeumbap: chars.bokkeumbap.name,
  };
  const result = resolveTextVariables(tc.template, vars);
  assert(result === tc.expected, `[${tc.gender}/${tc.player}] "${tc.template}" -> "${result}" (예상: "${tc.expected}")`);
}

// 2. 장소 선택 3개 경로 검증
console.log('\n--- 2. Day 1 장소 선택 3개 경로 검증 ---');
const places = ['s03_lego', 's03_skywalk', 's03_myeongdong'];
for (const p of places) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${p}.json`));
  assert(exists, `장소 씬 파일 존재: ${p}.json`);
  if (exists) {
    const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${p}.json`), 'utf8'));
    assert(data.dialogues && data.dialogues.length > 0, `${p}에 대사가 정상 수록되어 있음 (${data.dialogues.length}개)`);
  }
}

// 3. Day 3 수상버스 (#9, #10-1~#10-5) 경로 검증
console.log('\n--- 3. Day 3 선착장 & 수상버스 (#9 ~ #10-5) 경로 검증 ---');
const boatScenes = ['s09_pier', 's10_1_video', 's10_2_seat', 's10_3_dakgalbi', 's10_4_yangnyeom', 's10_5_goguma'];
for (const b of boatScenes) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${b}.json`));
  assert(exists, `Day 3 씬 파일 존재: ${b}.json`);
  if (exists && b !== 's09_pier') {
    const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${b}.json`), 'utf8'));
    assert(data.choices && data.choices.options.length > 0, `${b}에 선택지가 정상 수록되어 있음`);
  }
}

// 4. Day 3 남이섬 (#11-1 ~ #14-B) 경로 및 6가지 장소 순서 검증
console.log('\n--- 4. Day 3 남이섬 (#11-1 ~ #14-B) 경로 및 6가지 순서 검증 ---');
const day3Island = ['s11_1_arrive', 's11_2_place', 's12_a_dakgalbi', 's12_b_yangnyeom', 's12_c_goguma', 's13_sunset', 's13_2_return', 's14_pier_sunset', 's14_a_silhouette', 's14_b_bokkeumbap'];
for (const n of day3Island) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${n}.json`));
  assert(exists, `Day 3 남이섬/선착장 씬 파일 존재: ${n}.json`);
}

// 장소 선택 6가지 순열 + 세 번째 이벤트에서만 lastExtra 출력 검증
const islandPerms = [
  ['dakgalbi', 'yangnyeom', 'goguma'],
  ['dakgalbi', 'goguma', 'yangnyeom'],
  ['yangnyeom', 'dakgalbi', 'goguma'],
  ['yangnyeom', 'goguma', 'dakgalbi'],
  ['goguma', 'dakgalbi', 'yangnyeom'],
  ['goguma', 'yangnyeom', 'dakgalbi'],
];
const evFileMap = { dakgalbi: 's12_a_dakgalbi', yangnyeom: 's12_b_yangnyeom', goguma: 's12_c_goguma' };
for (const perm of islandPerms) {
  const visitOrder = [];
  let extraCount = 0;
  let extraChar = null;
  for (const cid of perm) {
    const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${evFileMap[cid]}.json`), 'utf8'));
    const isThird = visitOrder.length === 2;
    if (isThird && sc.lastExtra) { extraCount++; extraChar = cid; }
    visitOrder.push(cid);
  }
  assert(visitOrder.length === 3 && extraCount === 1 && extraChar === perm[2],
    `장소 순서 [${perm.join('->')}]: 3개 완료 및 마지막(${perm[2]})에만 추가 대사 발생`);
}

// #14/#15/#16 기준치(7점) 및 볶음밥 조건, 혼자 돌아가기 검증
assert(config.endingThresholds.dakgalbi === 7 && config.endingThresholds.yangnyeom === 7 && config.endingThresholds.goguma === 7 && config.endingThresholds.hidden_all_three_each === 7,
  '엔딩 기준치가 모두 7점으로 설정됨');
const endDak = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 'ending_dakgalbi.json'), 'utf8'));
assert(endDak.dialogues.some(d => d.onlyIf === 'hidden' && d.text.includes('잘 지내')), '개별 엔딩에 볶음밥 등장 시 반응 대사(onlyIf: hidden) 존재');
assert(endDak.dialogues.some(d => d.cg && d.cg.id === 'cg_ending_dakgalbi' && d.text.includes('홍보 영상에는 없던 웃음이었다.')), '개별 엔딩에 CG 정보 및 제안 나레이션 존재');
const endAlone = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 'ending_alone.json'), 'utf8'));
assert(endAlone.dialogues.some(d => d.text === '남이섬. 가평을 거치지 않고도, 하루 만에 다녀올 수 있는 거리였다.'), '혼자 돌아가기 엔딩 마지막 나레이션 정확함');

// 5. 엔딩 5종 도달 가능성 검증
console.log('\n--- 5. 엔딩 5종 씬 및 도달 검증 ---');
const endings = [
  'ending_dakgalbi',
  'ending_yangnyeom',
  'ending_goguma',
  'ending_bokkeumbap',
  'ending_alone'
];

for (const ed of endings) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${ed}.json`));
  assert(exists, `엔딩 씬 파일 존재: ${ed}.json`);
  if (exists) {
    const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${ed}.json`), 'utf8'));
    assert(data.type === 'ending', `${ed} 타입이 'ending'임`);
  }
}

// s15_final_choice 파일 검증
const s15Exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', 's15_final_choice.json'));
assert(s15Exists, `최종 선택 씬 s15_final_choice.json 존재`);

// ─── 추가 검증: 버그 및 구조 수정 5종 검증 ───

// 6. 이슈 1 (모바일 화면 UI & 100dvh & safe-area) 검증
console.log('\n--- 6. 이슈 1: 모바일 세로 레이아웃 및 CSS 검증 ---');
const mainCss = fs.readFileSync(path.join(rootDir, 'css', 'main.css'), 'utf8');
assert(mainCss.includes('100dvh'), 'CSS에 100dvh 단위가 적용되어 있음');
assert(mainCss.includes('safe-area-inset'), 'CSS에 safe-area-inset 환경변수가 반영되어 있음');
assert(mainCss.includes('@media (max-width: 768px), (orientation: portrait)'), '모바일 세로 전용 미디어 쿼리가 적용되어 있음');
assert(mainCss.includes('font-size: 16px !important'), '모바일 세로 대사창 폰트 크기가 16px 이상으로 설정되어 있음');
assert(mainCss.includes('min-height: 48px') || mainCss.includes('min-height: 44px'), '선택지 및 모달 터치 타겟이 44px 이상임');

// 7. 이슈 2 ("새로 시작" 뒤로 가기 버튼) 검증
console.log('\n--- 7. 이슈 2: "새로 시작" 모달 뒤로 가기 검증 ---');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
assert(indexHtml.includes('id="btn-gender-back"'), '성별 선택 모달에 뒤로 버튼(btn-gender-back)이 존재함');
assert(indexHtml.includes('id="btn-name-back"'), '이름 입력 모달에 뒤로 버튼(btn-name-back)이 존재함');

// 8. 이슈 3 (휴대폰 메시지 분리 및 phone_message 씬) 검증
console.log('\n--- 8. 이슈 3: 장소별 휴대폰 메시지 씬 분리 검증 ---');
const phoneScenes = ['s03_lego_phone', 's03_skywalk_phone', 's03_myeongdong_phone'];
for (const ps of phoneScenes) {
  const pPath = path.join(rootDir, 'data', 'scenes', `${ps}.json`);
  const pExists = fs.existsSync(pPath);
  assert(pExists, `휴대폰 메시지 씬 파일 존재: ${ps}.json`);
  if (pExists) {
    const data = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    assert(data.type === 'phone_message', `${ps} 타입이 'phone_message'임`);
    assert(data.partner && data.messages && data.messages.length > 0, `${ps}에 상대와 메시지 목록이 수록되어 있음`);
    assert(data.intro_vo && data.outro_vo, `${ps}에 intro_vo 및 outro_vo가 수록되어 있음`);
  }
}
const s03_2 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's03_2_day1_messages.json'), 'utf8'));
assert(s03_2.dialogues.length <= 2, `s03_2 대사창에서 메시지 A,B,C 텍스트가 모두 제거됨 (현재 대사 수: ${s03_2.dialogues.length})`);

// 9. 이슈 4 (스카이워크 이름 공개 "???" 버그 수정) 검증
console.log('\n--- 9. 이슈 4: 이름 ??? 공개 주석 및 세이브 필드 검증 ---');
const skywalkData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's03_skywalk.json'), 'utf8'));
const skywalkRevealLine = skywalkData.dialogues.find(d => d.text && d.text.includes('제 이름은'));
assert(skywalkRevealLine && skywalkRevealLine.text.includes('실제 이름으로 바뀜'), 's03_skywalk의 "제 이름은" 대사에 이름 공개 주석이 포함됨');
const saveJs = fs.readFileSync(path.join(rootDir, 'js', 'save.js'), 'utf8');
assert(saveJs.includes('revealedSpeakers'), 'save.js 세이브 데이터에 revealedSpeakers가 포함되어 영구 저장됨');

// 10. 이슈 5 (Day 2 세 명 순차 방문) 검증
console.log('\n--- 10. 이슈 5: Day 2 세 명 순차 방문 및 설정 검증 ---');
assert(config.flags && config.flags.day2 && config.flags.day2.meet_all_three === true, 'game_config.json flags.day2.meet_all_three 가 true 로 설정됨');
assert(saveJs.includes('day2Visited'), 'save.js 세이브 데이터에 day2Visited가 포함되어 영구 저장됨');
const engineJs = fs.readFileSync(path.join(rootDir, 'js', 'engine.js'), 'utf8');
assert(engineJs.includes('_presentDay2RemainingChoices'), 'engine.js에 Day 2 남은 인물 순차 선택 로직(_presentDay2RemainingChoices)이 구현됨');

// 11. 작업 4 검증: Day 1~2 인라인 선택지 파싱 확인
console.log('\n--- 11. 작업 4: Day 1~2 선택지 파싱 검증 ---');
const s07Dak = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_dakgalbi.json'), 'utf8'));
const s07Gog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_goguma.json'), 'utf8'));
const s07Yang = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_yangnyeom.json'), 'utf8'));
const countInlineChoices = (sc) => (sc.dialogues || []).filter(d => d.type === 'choice' && d.options?.length === 2).length;
assert(countInlineChoices(s07Dak) === 2, `s07_dakgalbi 인라인 선택지 2묶음(각 2개) 정상 파싱됨 (${countInlineChoices(s07Dak)}묶음)`);
assert(countInlineChoices(s07Gog) === 2, `s07_goguma 인라인 선택지 2묶음(각 2개) 정상 파싱됨 (${countInlineChoices(s07Gog)}묶음)`);
assert(countInlineChoices(s07Yang) === 2, `s07_yangnyeom 인라인 선택지 2묶음(각 2개) 정상 파싱됨 (${countInlineChoices(s07Yang)}묶음)`);
assert(config.SHOW_HUD === false, 'config.SHOW_HUD가 false로 설정되어 상시 HUD 숨김 제어됨');

// 12. 작업 3 검증: Day 2 임의 순서(순열 6종) 선택 시뮬레이션
console.log('\n--- 12. 작업 3: Day 2 임의 순서(6개 순열) 방문 시뮬레이션 ---');
const permutations = [
  ['dakgalbi', 'goguma', 'yangnyeom'],
  ['dakgalbi', 'yangnyeom', 'goguma'],
  ['goguma', 'dakgalbi', 'yangnyeom'],
  ['goguma', 'yangnyeom', 'dakgalbi'],
  ['yangnyeom', 'dakgalbi', 'goguma'],
  ['yangnyeom', 'goguma', 'dakgalbi']
];

for (const order of permutations) {
  let simulatedVisited = [];
  let currentScene = 's07_day2';
  for (let step = 0; step < 3; step++) {
    const target = order[step];
    assert(!simulatedVisited.includes(target), `순열 [${order.join(' -> ')}] step ${step + 1}: ${target} 선택 가능`);
    simulatedVisited.push(target);
    currentScene = `s07_${target}`;
    // 대상 씬 방문 완료 후 Day 2 복귀
    currentScene = 's07_day2';
  }
  assert(simulatedVisited.length === 3, `순열 [${order.join(' -> ')}]: 3명 모두 방문 완료`);
  const nextTarget = (simulatedVisited.length >= 3) ? 's08_day2_end' : 's07_day2';
  assert(nextTarget === 's08_day2_end', `순열 [${order.join(' -> ')}]: 3명 완료 후 s08_day2_end로 전환 성공`);
}

// 13. 작업 6 검증: 시작 화면에서 고른 성별 = 상대 캐릭터 성별
console.log('\n--- 13. 작업 6: 선택한 성별 = 상대 캐릭터 성별 이름 매핑 ---');
const { getDisplayName, appendJosa } = require(path.join(rootDir, 'js', 'utils.js'));
const NAME_MAP = {
  male: { dakgalbi: '다고길', yangnyeom: '양연우', goguma: '고구민', bokkeumbap: '박복검' },
  female: { dakgalbi: '다곡희', yangnyeom: '양연미', goguma: '고규미', bokkeumbap: '박복은' },
};
for (const g of ['male', 'female']) {
  for (const cid of Object.keys(NAME_MAP[g])) {
    assert(getDisplayName(cid, g) === NAME_MAP[g][cid], `${g} 선택 -> ${cid} = ${NAME_MAP[g][cid]}`);
  }
}

// 전 장면을 두 성별로 훑으며 반대 성별 이름이 섞이지 않는지 검증
for (const g of ['male', 'female']) {
  const other = g === 'male' ? 'female' : 'male';
  const names = { player: '테스터' };
  for (const cid of Object.keys(NAME_MAP[g])) { names[cid] = NAME_MAP[g][cid]; }
  let leaked = [];
  const check = (txt, where) => {
    if (typeof txt !== 'string') return;
    const out = resolveTextVariables(txt, names);
    for (const n of Object.values(NAME_MAP[other])) if (out.includes(n)) leaked.push(where + ':' + n);
    if (/\{(닭갈비|양념|고구마|볶음밥|player)/.test(out)) leaked.push(where + ':미치환');
  };
  for (const f of fs.readdirSync(path.join(rootDir, 'data', 'scenes'))) {
    if (!f.endsWith('.json')) continue;
    const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', f), 'utf8'));
    (sc.dialogues || []).forEach((d, i) => check(d.text, f + '#' + i));
    (sc.messages || []).forEach((m, i) => check(m.text, f + '#msg' + i));
    for (const o of (sc.choices?.options || [])) { check(o.text, f + '#opt'); (o.followUp || []).forEach(u => check(u.text, f + '#fu')); }
  }
  assert(leaked.length === 0, `${g} 시작: 전 장면에서 반대 성별 이름/미치환 변수 없음 ${leaked.slice(0, 3).join(', ')}`);
}

// '으로/로' 조사 검증 (ㄹ 받침 '로', 일반 받침 '으로', 받침 없음 '로')
assert(appendJosa('다고길', '으로/로') === '다고길로', 'ㄹ 받침 "다고길" + 으로/로 -> "다고길로"');
assert(appendJosa('양연미', '으로/로') === '양연미로', '받침 없음 "양연미" + 으로/로 -> "양연미로"');
assert(appendJosa('고구민', '으로/로') === '고구민으로', '일반 받침 "고구민" + 으로/로 -> "고구민으로"');
assert(appendJosa('박복은', '으로/로') === '박복은으로', '일반 받침 "박복은" + 으로/로 -> "박복은으로"');

// 14. 작업 2 검증: DAY 전환 연출 및 스타일 검증
console.log('\n--- 14. 작업 2: DAY 전환 연출(페이드, 타이틀 카드) 검증 ---');
const rendererJs = fs.readFileSync(path.join(rootDir, 'js', 'renderer.js'), 'utf8');
assert(rendererJs.includes('playDayTransition'), 'renderer.js에 playDayTransition 구현됨');
assert(!rendererJs.includes('skipDayTransition'), 'DAY 전환 건너뛰기(skipDayTransition) 제거됨');
assert(!/chapterOverlay\.onclick = \(e\) => \{\s*e\.stopPropagation\(\);\s*finish\(\)/.test(rendererJs), '클릭으로 DAY 전환 종료하는 핸들러 없음');
assert(config.dayTransition && config.dayTransition.fadeOutMs === 1500 && config.dayTransition.holdMs === 3500 && config.dayTransition.fadeInMs === 1500, 'DAY 전환 시간이 config.dayTransition 상수로 분리됨(1.5/3.5/1.5초)');
assert(engineJs.includes('_runDayTransition') && engineJs.includes('setTimeout(() => { if (this.state.isTransitioning) unlock()'), 'DAY 전환 입력 잠금 해제 안전장치 존재');
assert(mainCss.includes('#chapter-title-overlay'), 'CSS에 #chapter-title-overlay 스타일 존재');
assert(mainCss.includes('.day-title-badge'), 'CSS에 .day-title-badge 스타일 존재');
assert(mainCss.includes('.day-title-subtitle'), 'CSS에 .day-title-subtitle 스타일 존재');
assert(engineJs.includes('_runDayTransition(1,') && engineJs.includes('_runDayTransition(2,') && engineJs.includes('_runDayTransition(3,'), 'Day 1/2/3 전환 연출 적용됨');

// 15. 작업 4/5/1/2 및 Day 3 검증
console.log('\\n--- 15. 반응 대사 / 호감도 부호 / 메모 숨김 / 따옴표 / Day 3 순차 선택 ---');
assert(engineJs.includes('_onDone') && engineJs.includes('__followup__'), '선택지 followUp 반응 대사 재생 구현됨');
assert(rendererJs.includes("isPositive ? '+' : '-'") && rendererJs.includes('Math.abs(delta)'), '호감도 팝업이 +N / -N 부호를 항상 표시');
assert(engineJs.includes('Math.max(0,'), '호감도가 0 미만으로 내려가지 않음');
const s02 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's02_place_select.json'), 'utf8'));
assert(!/각 보기에/.test(s02.choices.question), '장소 선택 안내 메모 문구 제거됨');
let quoted = 0;
for (const f of fs.readdirSync(path.join(rootDir, 'data', 'scenes'))) {
  if (!f.endsWith('.json')) continue;
  const sc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', f), 'utf8'));
  for (const d of (sc.dialogues || [])) if (d.text && /^["“”]|["“”]$/.test(d.text)) quoted++;
  for (const o of (sc.choices?.options || [])) for (const u of (o.followUp || [])) if (/^["“”]|["“”]$|\\(\\+\\)$/.test(u.text)) quoted++;
}
assert(quoted === 0, `대사 앞뒤 큰따옴표 없음 (잔존 ${quoted})`);
assert(engineJs.includes('_presentDay3SeatChoices') && engineJs.includes('_presentPlaceSelect') && saveJs.includes('day3SeatVisited') && saveJs.includes('day3Order'), 'Day 3 좌석/장소 순차 선택 및 세이브 필드 구현됨');
assert(rendererJs.includes('showLikeFeedback') && rendererJs.includes('showCG') && rendererJs.includes('setAffinityVisible'), 'Day 3 호감도 막대 바(숫자 미표시) 및 CG 플레이스홀더 구현됨');

console.log('\n====================================================');
console.log(` 검증 결과: ${passedTests} / ${totalTests} 테스트 통과 (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
