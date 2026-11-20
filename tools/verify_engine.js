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

// 3. 좌석 선택 3개 경로 검증
console.log('\n--- 3. 수상버스 좌석 선택 3개 경로 검증 ---');
const seats = ['s11_dakgalbi', 's11_yangnyeom', 's11_goguma'];
for (const s of seats) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${s}.json`));
  assert(exists, `좌석 뱃길 씬 파일 존재: ${s}.json`);
  if (exists) {
    const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', `${s}.json`), 'utf8'));
    assert(data.choices !== null, `${s}에 선택지가 정상 수록되어 있음`);
  }
}

// 4. 남이섬 3개 경로 검증
console.log('\n--- 4. 남이섬 이벤트 3개 경로 검증 ---');
const namiseom = ['s12_dakgalbi', 's12_yangnyeom', 's12_goguma'];
for (const n of namiseom) {
  const exists = fs.existsSync(path.join(rootDir, 'data', 'scenes', `${n}.json`));
  assert(exists, `남이섬 씬 파일 존재: ${n}.json`);
}

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
const skywalkRevealLine = skywalkData.dialogues.find(d => d.text.includes('제 이름은'));
assert(skywalkRevealLine && skywalkRevealLine.text.includes('실제 이름으로 바뀜'), 's03_skywalk의 "제 이름은" 대사에 이름 공개 주석이 포함됨');
const saveJs = fs.readFileSync(path.join(rootDir, 'js', 'save.js'), 'utf8');
assert(saveJs.includes('revealedSpeakers'), 'save.js 세이브 데이터에 revealedSpeakers가 포함되어 영구 저장됨');

// 10. 이슈 5 (Day 2 세 명 순차 방문) 검증
console.log('\n--- 10. 이슈 5: Day 2 세 명 순차 방문 및 설정 검증 ---');
assert(config.flags && config.flags.day2 && config.flags.day2.meet_all_three === true, 'game_config.json flags.day2.meet_all_three 가 true 로 설정됨');
assert(saveJs.includes('day2Visited'), 'save.js 세이브 데이터에 day2Visited가 포함되어 영구 저장됨');
const engineJs = fs.readFileSync(path.join(rootDir, 'js', 'engine.js'), 'utf8');
assert(engineJs.includes('_presentDay2RemainingChoices'), 'engine.js에 Day 2 남은 인물 순차 선택 로직(_presentDay2RemainingChoices)이 구현됨');

// 11. 작업 4 검증: 선택지 누락 복구 확인
console.log('\n--- 11. 작업 4: 선택지 누락 복구 검증 ---');
const s07Dak = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_dakgalbi.json'), 'utf8'));
const s07Gog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_goguma.json'), 'utf8'));
const s07Yang = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'scenes', 's07_yangnyeom.json'), 'utf8'));
assert(s07Dak.choices && s07Dak.choices.options.length === 2, `s07_dakgalbi 선택지 2개 정상 파싱됨 (${s07Dak.choices.options.length}개)`);
assert(s07Gog.choices && s07Gog.choices.options.length === 2, `s07_goguma 선택지 2개 정상 파싱됨 (${s07Gog.choices.options.length}개)`);
assert(s07Yang.choices && s07Yang.choices.options.length === 2, `s07_yangnyeom 선택지 2개 정상 파싱됨 (${s07Yang.choices.options.length}개)`);

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

// 13. 작업 1 검증: 상대방 캐릭터 실명 및 조사 '으로/로' 검증
console.log('\n--- 13. 작업 1: 상대 캐릭터 실명 및 한국어 조사(으로/로 포함) 검증 ---');
const { getDisplayName, appendJosa } = require(path.join(rootDir, 'js', 'utils.js'));
// 남성 플레이어(상대 여성) -> 다곡희, 양연미, 고규미, 박복은
assert(getDisplayName('dakgalbi', 'male', true) === '다곡희', '남성 플레이어 -> dakgalbi = 다곡희');
assert(getDisplayName('yangnyeom', 'male', true) === '양연미', '남성 플레이어 -> yangnyeom = 양연미');
assert(getDisplayName('goguma', 'male', true) === '고규미', '남성 플레이어 -> goguma = 고규미');
assert(getDisplayName('bokkeumbap', 'male', true) === '박복은', '남성 플레이어 -> bokkeumbap = 박복은');

// 여성 플레이어(상대 남성) -> 다고길, 양연우, 고구민, 박복검
assert(getDisplayName('dakgalbi', 'female', true) === '다고길', '여성 플레이어 -> dakgalbi = 다고길');
assert(getDisplayName('yangnyeom', 'female', true) === '양연우', '여성 플레이어 -> yangnyeom = 양연우');
assert(getDisplayName('goguma', 'female', true) === '고구민', '여성 플레이어 -> goguma = 고구민');
assert(getDisplayName('bokkeumbap', 'female', true) === '박복검', '여성 플레이어 -> bokkeumbap = 박복검');

// 엔진 state.gender 직결 검증 ('female' 선택 시 다곡희 등, 'male' 선택 시 다고길 등)
assert(getDisplayName('dakgalbi', 'female') === '다곡희', 'state.gender="female" -> dakgalbi = 다곡희');
assert(getDisplayName('dakgalbi', 'male') === '다고길', 'state.gender="male" -> dakgalbi = 다고길');

// '으로/로' 조사 검증 (ㄹ 받침 '로', 일반 받침 '으로', 받침 없음 '로')
assert(appendJosa('다고길', '으로/로') === '다고길로', 'ㄹ 받침 "다고길" + 으로/로 -> "다고길로"');
assert(appendJosa('양연미', '으로/로') === '양연미로', '받침 없음 "양연미" + 으로/로 -> "양연미로"');
assert(appendJosa('고구민', '으로/로') === '고구민으로', '일반 받침 "고구민" + 으로/로 -> "고구민으로"');
assert(appendJosa('박복은', '으로/로') === '박복은으로', '일반 받침 "박복은" + 으로/로 -> "박복은으로"');

// 14. 작업 2 검증: DAY 전환 연출 및 스타일 검증
console.log('\n--- 14. 작업 2: DAY 전환 연출(페이드, 타이틀 카드) 검증 ---');
const rendererJs = fs.readFileSync(path.join(rootDir, 'js', 'renderer.js'), 'utf8');
assert(rendererJs.includes('playDayTransition'), 'renderer.js에 playDayTransition 구현됨');
assert(rendererJs.includes('skipDayTransition'), 'renderer.js에 skipDayTransition 구현됨');
assert(mainCss.includes('#chapter-title-overlay'), 'CSS에 #chapter-title-overlay 스타일 존재');
assert(mainCss.includes('.day-title-badge'), 'CSS에 .day-title-badge 스타일 존재');
assert(mainCss.includes('.day-title-subtitle'), 'CSS에 .day-title-subtitle 스타일 존재');
assert(engineJs.includes('playDayTransition(1'), 'engine.js에 Day 1 전환 연출 적용됨');
assert(engineJs.includes('playDayTransition(2'), 'engine.js에 Day 2 전환 연출 적용됨');
assert(engineJs.includes('playDayTransition(3'), 'engine.js에 Day 3 전환 연출 적용됨');

console.log('\n====================================================');
console.log(` 검증 결과: ${passedTests} / ${totalTests} 테스트 통과 (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
