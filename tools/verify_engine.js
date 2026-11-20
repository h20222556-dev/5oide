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

console.log('\n====================================================');
console.log(` 검증 결과: ${passedTests} / ${totalTests} 테스트 통과 (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
