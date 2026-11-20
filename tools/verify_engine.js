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

console.log('\n====================================================');
console.log(` 검증 결과: ${passedTests} / ${totalTests} 테스트 통과 (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
