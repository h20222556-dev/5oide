/**
 * tools/import_story.js
 * '오이데_스토리_정리본.md'를 읽어 게임 JSON 데이터 및 data/_import_report.md를 생성하는 파서 스크립트.
 * Node.js 기본 모듈(fs, path)만 사용.
 */

const fs = require('fs');
const path = require('path');

// 프로젝트 루트 경로
const rootDir = path.resolve(__dirname, '..');
const downloadsDir = '/Users/kakajae/Downloads/files';
const storyMdPath = fs.existsSync(path.join(rootDir, '오이데_스토리_정리본.md'))
  ? path.join(rootDir, '오이데_스토리_정리본.md')
  : path.join(downloadsDir, '오이데_스토리_정리본.md');

console.log(`[import_story] 대상 스토리 파일: ${storyMdPath}`);
if (!fs.existsSync(storyMdPath)) {
  console.error(`오류: 스토리 파일을 찾을 수 없습니다: ${storyMdPath}`);
  process.exit(1);
}

const mdContent = fs.readFileSync(storyMdPath, 'utf8');
const lines = mdContent.split(/\r?\n/);

// 리포트 수집용 데이터
const report = {
  warningItems: [],
  choiceCount: 0,
  sceneCount: 0,
  variableList: [
    "{player} (플레이어 입력 이름)",
    "{닭갈비} (여: 다곡희 / 남: 다고길)",
    "{양념} (여: 양연미 / 남: 양연우)",
    "{고구마} (여: 고규미 / 남: 고구민)",
    "{볶음밥} (여: 박복은 / 남: 박복검)"
  ],
  requiredImages: {
    backgrounds: new Set(),
    characters: new Set()
  },
  scenes: []
};

// 1. "3. 확인 필요" 섹션에서 ⚠ 항목 추출
let inCheckSection = false;
for (const line of lines) {
  if (line.includes('## 3. 확인 필요')) {
    inCheckSection = true;
    continue;
  }
  if (inCheckSection) {
    if (line.startsWith('## ')) break;
    const m = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      report.warningItems.push({ title: m[1], desc: m[2] });
    }
  }
}

// 2. config 파일 생성
const configDir = path.join(rootDir, 'config');
fs.mkdirSync(configDir, { recursive: true });

// 2-1. score_scale.json
const scoreScale = {
  "크게↑": 6,
  "↑": 4,
  "소폭↑": 2,
  "소폭↓": -2,
  "(+)": 3,
  "변화 적음": 0
};
fs.writeFileSync(path.join(configDir, 'score_scale.json'), JSON.stringify(scoreScale, null, 2), 'utf8');

// 2-2. characters.json
const charactersData = {
  "female": {
    "dakgalbi": { "id": "dakgalbi", "name": "다곡희", "role": "닭갈비", "gender": "female", "color": "#ff6b6b" },
    "yangnyeom": { "id": "yangnyeom", "name": "양연미", "role": "양념", "gender": "female", "color": "#ee5253" },
    "goguma": { "id": "goguma", "name": "고규미", "role": "고구마", "gender": "female", "color": "#feca57" },
    "bokkeumbap": { "id": "bokkeumbap", "name": "박복은", "role": "볶음밥", "gender": "female", "color": "#ff9f43", "isHidden": true }
  },
  "male": {
    "dakgalbi": { "id": "dakgalbi", "name": "다고길", "role": "닭갈비", "gender": "male", "color": "#ff6b6b" },
    "yangnyeom": { "id": "yangnyeom", "name": "양연우", "role": "양념", "gender": "male", "color": "#ee5253" },
    "goguma": { "id": "goguma", "name": "고구민", "role": "고구마", "gender": "male", "color": "#feca57" },
    "bokkeumbap": { "id": "bokkeumbap", "name": "박복검", "role": "볶음밥", "gender": "male", "color": "#ff9f43", "isHidden": true }
  }
};
fs.writeFileSync(path.join(configDir, 'characters.json'), JSON.stringify(charactersData, null, 2), 'utf8');

// 2-3. game_config.json
const gameConfig = {
  "title": "오이데 (춘천에서 5명의 이상한 데이트)",
  "version": "1.0.0",
  "textSpeed": 40,
  "autoSpeed": 2000,
  "skipSpeed": 25,
  "bgmVolume": 0.5,
  "sfxVolume": 0.7,
  "showAffinity": true,
  "genderSelection": {
    "prompt": "당신의 성별(또는 상대 캐릭터들의 성별)을 선택하세요.",
    "options": [
      { "id": "female", "label": "여성 등장인물과 데이트 (다곡희, 양연미, 고규미, 박복은)" },
      { "id": "male", "label": "남성 등장인물과 데이트 (다고길, 양연우, 고구민, 박복검)" }
    ]
  },
  "hidden_unlock": {
    "mode": "all_three", // "all_three" (기본: 세 명 모두 기준치 이상) 또는 "reunion_temp"
    "description": "all_three: 닭갈비/양념/고구마 호감도가 모두 기준치 이상일 때 볶음밥 등장 | reunion_temp: 히든 재회온도 기준치 이상"
  },
  "endingThresholds": {
    "dakgalbi": 8,
    "yangnyeom": 8,
    "goguma": 8,
    "hidden_all_three_each": 6,
    "reunion_temp": 10
  },
  "flags": {
    "day1_repeat": {
      "messages_each_visit": true
    },
    "day2": {
      "meet_all_three": false
    }
  },
  "saveSlots": 3,
  "debugKey": "KeyD"
};

fs.writeFileSync(path.join(configDir, 'game_config.json'), JSON.stringify(gameConfig, null, 2), 'utf8');
// 하위 호환을 위해 data/config 에도 복사
const dataConfigDir = path.join(rootDir, 'data', 'config');
fs.mkdirSync(dataConfigDir, { recursive: true });
fs.writeFileSync(path.join(dataConfigDir, 'game_config.json'), JSON.stringify(gameConfig, null, 2), 'utf8');
fs.writeFileSync(path.join(dataConfigDir, 'characters.json'), JSON.stringify(charactersData, null, 2), 'utf8');
fs.writeFileSync(path.join(dataConfigDir, 'score_scale.json'), JSON.stringify(scoreScale, null, 2), 'utf8');

// 3. 장면 파싱
const scenesDir = path.join(rootDir, 'data', 'scenes');
fs.mkdirSync(scenesDir, { recursive: true });

// 배경 및 캐릭터 이미지 매핑용 사전
const bgMapping = {
  "검정": "bg_black",
  "창밖": "bg_train_window",
  "휴대폰": "bg_phone_screen",
  "춘천역": "bg_chuncheon_station",
  "안내책자": "bg_brochure",
  "레고랜드": "bg_legoland",
  "스카이워크": "bg_skywalk",
  "명동": "bg_myeongdong",
  "숙소": "bg_hotel",
  "시내": "bg_chuncheon_city",
  "카페": "bg_cafe",
  "선착장": "bg_pier",
  "수상버스": "bg_boat",
  "갑판": "bg_boat_deck",
  "선내": "bg_boat_inside",
  "선미": "bg_boat_stern",
  "메타세쿼이아": "bg_namiseom_meta",
  "산책로": "bg_namiseom_trail",
  "은행나무": "bg_namiseom_ginkgo",
  "남이섬": "bg_namiseom",
  "노을": "bg_sunset_pier",
  "해질녘": "bg_sunset_pier"
};

function resolveBgId(text) {
  if (!text) return "bg_black";
  for (const [k, v] of Object.entries(bgMapping)) {
    if (text.includes(k)) return v;
  }
  return "bg_" + text.replace(/[^a-zA-Z0-9가-힣]/g, '_').toLowerCase();
}

// 텍스트에서 이미지 추출하여 리포트에 기록
function recordBg(bgId) {
  if (bgId) report.requiredImages.backgrounds.add(bgId);
}
function recordChar(charId, expr) {
  if (charId && expr) report.requiredImages.characters.add(`${charId}/${expr}`);
}

// 마크다운 파싱 상태 머신
let currentScene = null;
const allScenes = [];

function finalizeScene() {
  if (currentScene && currentScene.id) {
    allScenes.push(currentScene);
    report.scenes.push({ id: currentScene.id, title: currentScene.title, dialogues: currentScene.dialogues.length });
  }
  currentScene = null;
}

let i = 0;
while (i < lines.length) {
  const line = lines[i];

  // 장면 헤더 감지: ### [sXX...] 제목 또는 #### [sXX...] 제목
  const headerMatch = line.match(/^#{3,4}\s+\[([a-zA-Z0-9_]+)\]\s*(.*)$/);
  if (headerMatch) {
    finalizeScene();
    const id = headerMatch[1];
    const title = headerMatch[2].trim();
    currentScene = {
      id,
      title,
      type: id.startsWith('ending_') ? 'ending' : (id === 's15_final_choice' || id === 's14_pier_sunset' ? 'choice_ending' : 'normal'),
      background: "bg_black",
      time: "낮",
      bgm: "bgm_main",
      direction: [],
      dialogues: [],
      choices: null
    };
    report.sceneCount++;
    i++;
    continue;
  }

  // 아직 장면이 시작되지 않았으면 스킵
  if (!currentScene) {
    i++;
    continue;
  }

  // 3. 확인 필요 섹션에 도달하면 장면 파싱 종료
  if (line.startsWith('## 3. 확인 필요')) {
    finalizeScene();
    break;
  }

  // 배경 감지
  if (line.startsWith('배경:')) {
    const rawBg = line.replace('배경:', '').trim();
    const bgId = resolveBgId(rawBg);
    currentScene.background = bgId;
    recordBg(bgId);
    i++;
    continue;
  }

  // 연출 감지
  if (line.startsWith('연출:')) {
    const dir = line.replace('연출:', '').trim();
    currentScene.direction.push(dir);
    if (dir.includes('창밖')) recordBg('bg_train_window');
    if (dir.includes('휴대폰') || dir.includes('채팅')) recordBg('bg_phone_screen');
    if (dir.includes('안내책자')) recordBg('bg_brochure');
    if (dir.includes('남이섬')) recordBg('bg_namiseom');
    if (dir.includes('밤하늘')) recordBg('bg_night_sky');
    i++;
    continue;
  }

  // 자막 / 나레이션 감지 (나레이션, 내레이션, 자막)
  if (line.match(/^[-*]?\s*(나레이션|내레이션|영상 내레이션|영상 나레이션|자막):\s*/)) {
    const isSub = line.includes('자막:');
    const text = line.replace(/^[-*]?\s*(나레이션|내레이션|영상 내레이션|영상 나레이션|자막):\s*/, '').replace(/^"|"$/g, '').trim();
    currentScene.dialogues.push({
      speaker: null,
      speakerType: isSub ? 'subtitle' : 'narration',
      text: text,
      characters: []
    });
    i++;
    continue;
  }

  // 대사 감지: - 화자[표정]: "대사" 또는 - 화자: "대사" 또는 - > 주인공: "대사"
  const dialMatch = line.match(/^-\s*(?:>\s*)?([^:\[]+)(?:\[([^\]]+)\])?:\s*"?(.*?)"?$/);
  if (dialMatch && !line.startsWith('- A:') && !line.startsWith('- B:') && !line.startsWith('- C:') && !line.startsWith('- D:')) {
    let speakerRaw = dialMatch[1].trim();
    const exprRaw = dialMatch[2] ? dialMatch[2].trim() : "기본";
    let text = dialMatch[3].trim();

    // 나레이션 / 내레이션인 경우 화자 이름 제거
    if (speakerRaw.includes('나레이션') || speakerRaw.includes('내레이션')) {
      currentScene.dialogues.push({
        speaker: null,
        speakerType: 'narration',
        text: text,
        characters: []
      });
      i++;
      continue;
    }

    let speakerType = 'normal';
    if (speakerRaw.includes('(V.O.)') || speakerRaw.includes('(속마음)')) {
      speakerType = 'vo';
      speakerRaw = speakerRaw.replace(/\(V\.O\.\)|\(속마음\)/g, '').trim();
    } else if (speakerRaw.includes('(O.S.)') || speakerRaw.includes('(화면 밖)') || speakerRaw.includes('[화면 밖]')) {
      speakerType = 'os';
      speakerRaw = speakerRaw.replace(/\(O\.S\.\)|\(화면 밖\)|\[화면 밖\]/g, '').trim();
    }


    // 캐릭터 및 표정 분석
    let charId = null;
    let isBlush = false;
    let expr = exprRaw;
    if (expr.includes('+홍조')) {
      isBlush = true;
      expr = expr.replace('+홍조', '').trim();
    }

    if (speakerRaw.includes('닭갈비')) charId = 'dakgalbi';
    else if (speakerRaw.includes('고구마')) charId = 'goguma';
    else if (speakerRaw.includes('양념')) charId = 'yangnyeom';
    else if (speakerRaw.includes('볶음밥')) charId = 'bokkeumbap';

    // ???[닭갈비|기본] 형태 파싱
    if (speakerRaw === '???' && expr.includes('|')) {
      const parts = expr.split('|');
      const cName = parts[0].trim();
      expr = parts[1] ? parts[1].trim() : '기본';
      if (cName.includes('닭갈비')) charId = 'dakgalbi';
      else if (cName.includes('고구마')) charId = 'goguma';
      else if (cName.includes('양념')) charId = 'yangnyeom';
      else if (cName.includes('볶음밥')) charId = 'bokkeumbap';
    }

    const charList = [];
    if (charId) {
      charList.push({
        id: charId,
        position: 'center',
        expression: expr,
        blush: isBlush
      });
      recordChar(charId, expr);
      if (isBlush) recordChar(charId, 'blush');
    }

    currentScene.dialogues.push({
      speaker: speakerRaw,
      speakerType: speakerType,
      text: text,
      characters: charList
    });
    i++;
    continue;
  }

  // CHOICE 블록 감지 (뒤에 ⚠ 기호 등이 붙은 경우도 허용)
  const choiceHeader = line.match(/^CHOICE\s+([a-zA-Z0-9_]+)[^\w—\n]*(?:—\s*(.*))?$/);
  if (choiceHeader) {
    report.choiceCount++;
    const choiceId = choiceHeader[1];
    const question = choiceHeader[2] ? choiceHeader[2].trim() : "선택하세요";
    const options = [];

    i++;
    // 보기 시작점(- A:)까지 중간 메모/안내 라인 건너뛰기
    while (i < lines.length && !lines[i].match(/^-\s*[A-D]:/) && !lines[i].startsWith('###') && !lines[i].startsWith('CHOICE')) {
      i++;
    }

    while (i < lines.length && lines[i].match(/^-\s*[A-D]:/)) {
      const optLine = lines[i];
      const optMatch = optLine.match(/^-\s*([A-D]):\s*(.*)$/);
      if (optMatch) {
        const key = optMatch[1];
        let optText = optMatch[2].trim();
        let nextScene = null;
        if (optText.includes('→')) {
          const parts = optText.split('→');
          optText = parts[0].trim();
          nextScene = parts[1].trim();
        }

        // 보기 아래의 효과 / 이어지는 대사 탐색
        let effectText = "";
        let followUpDialogues = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^-\s*[A-D]:/) && !lines[j].startsWith('CHOICE') && !lines[j].startsWith('###') && !lines[j].startsWith('(공통') && !lines[j].startsWith('나레이션:') && lines[j].trim() !== '') {
          const subLine = lines[j].trim();
          if (subLine.startsWith('효과:')) {
            effectText = subLine.replace('효과:', '').trim();
          } else if (subLine.startsWith('- ') && subLine.includes(':')) {
            // 이어지는 대사
            const m = subLine.match(/^-\s*([^:]+):\s*"?(.*?)"?$/);
            if (m) {
              followUpDialogues.push({ speaker: m[1].trim(), text: m[2].trim() });
            }
          }
          j++;
        }

        // 효과 파싱 (크게↑, ↑, 소폭↑, 소폭↓, (+), 고민 상태)
        const parsedEffects = { score: 0, scale: null, troubleState: null, targetChar: null };
        if (effectText.includes('크게↑')) { parsedEffects.score = 6; parsedEffects.scale = '크게↑'; }
        else if (effectText.includes('소폭↑')) { parsedEffects.score = 2; parsedEffects.scale = '소폭↑'; }
        else if (effectText.includes('소폭↓')) { parsedEffects.score = -2; parsedEffects.scale = '소폭↓'; }
        else if (effectText.includes('↑')) { parsedEffects.score = 4; parsedEffects.scale = '↑'; }
        else if (effectText.includes('(+)')) { parsedEffects.score = 3; parsedEffects.scale = '(+)'; }

        if (effectText.includes('고민이 풀리기 시작')) parsedEffects.troubleState = '고민이 풀리기 시작';
        else if (effectText.includes('고민은 그대로')) parsedEffects.troubleState = '고민은 그대로';
        else if (effectText.includes('고민은 오히려 깊어짐')) parsedEffects.troubleState = '고민은 오히려 깊어짐';
        else if (effectText.includes('대화가 이어짐')) parsedEffects.troubleState = '대화가 이어짐';
        else if (effectText.includes('고민 자극')) parsedEffects.troubleState = '고민 자극';

        options.push({
          key,
          text: optText,
          next: nextScene,
          effectDesc: effectText,
          effects: parsedEffects,
          followUp: followUpDialogues
        });
      }
      i++;
    }

    currentScene.choices = {
      id: choiceId,
      question: question,
      options: options
    };
    continue;
  }


  i++;
}
finalizeScene();

// 4. 특별 씬 및 엔딩 5종 추가
const endingScenes = [
  { id: "ending_dakgalbi", title: "닭갈비 엔딩", char: "dakgalbi" },
  { id: "ending_yangnyeom", title: "양념 엔딩", char: "yangnyeom" },
  { id: "ending_goguma", title: "고구마 엔딩", char: "goguma" },
  { id: "ending_bokkeumbap", title: "볶음밥 히든 엔딩", char: "bokkeumbap" },
  { id: "ending_alone", title: "혼자 돌아가는 엔딩", char: null }
];

for (const ed of endingScenes) {
  const sceneData = {
    id: ed.id,
    title: ed.title,
    type: "ending",
    background: "bg_sunset_pier",
    time: "황혼",
    bgm: "bgm_ending",
    dialogues: [
      {
        speaker: null,
        speakerType: "narration",
        text: "[누락] 엔딩 원고 필요 (원문에 없는 대사로, 원고 수급 후 data 파일에 입력)",
        characters: ed.char ? [{ id: ed.char, position: "center", expression: "웃음" }] : []
      }
    ],
    choices: null
  };
  allScenes.push(sceneData);
  report.scenes.push({ id: ed.id, title: ed.title, dialogues: 1 });
  report.sceneCount++;
}

// 5. 각 씬을 data/scenes/{id}.json 파일로 저장
const defaultNextMap = {
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

const sceneFileList = [];
for (const scene of allScenes) {
  if (!scene.next && defaultNextMap[scene.id]) {
    scene.next = defaultNextMap[scene.id];
  }
  const fileName = `${scene.id}.json`;
  fs.writeFileSync(path.join(scenesDir, fileName), JSON.stringify(scene, null, 2), 'utf8');
  sceneFileList.push(fileName);
}


// game_config.json에 sceneFiles 목록 갱신
gameConfig.sceneFiles = sceneFileList;
fs.writeFileSync(path.join(configDir, 'game_config.json'), JSON.stringify(gameConfig, null, 2), 'utf8');
fs.writeFileSync(path.join(dataConfigDir, 'game_config.json'), JSON.stringify(gameConfig, null, 2), 'utf8');

// 6. data/_import_report.md 작성
const reportMd = `# 오이데 스토리 데이터 변환 리포트 (Import Report)

이 파일은 \`오이데_스토리_정리본.md\`를 파싱하여 생성된 데이터 현황 및 원문의 확인 필요(⚠) 사항을 정리한 보고서입니다.
원문 대사는 지어내지 않고 충실히 보존하였으며, 확인이 필요한 사항은 임의로 메우지 않고 옵션/플래그 및 리포트로 분리했습니다.

---

## 1. 변환 요약 통계
- **총 장면 수**: ${report.sceneCount}개 (프롤로그, 장소 선택, 만남, 뱃길, 남이섬, 선착장 분기, 최종 선택 및 엔딩 5종 포함)
- **총 선택지 수**: ${report.choiceCount}개 (CHOICE 블록 기준)
- **지원 변수**: 
${report.variableList.map(v => `  - ${v}`).join('\n')}

---

## 2. 원문 확인 필요(⚠) 및 임시 처리 목록

| 번호 | 항목 | 원문 상황 및 처리 방식 |
|---|---|---|
${report.warningItems.map((item, idx) => `| ${idx + 1} | **${item.title}** | ${item.desc} |`).join('\n')}

---

## 3. 필요한 이미지 리소스 목록

### 1) 배경 이미지 (\`assets/backgrounds/{배경id}.png\`)
| 배경 ID | 대응 원문 배경 및 설명 |
|---|---|
${Array.from(report.requiredImages.backgrounds).sort().map(bg => `| \`${bg}.png\` | ${bg} (춘천역, 레고랜드, 스카이워크, 명동, 숙소, 선착장 등) |`).join('\n')}

### 2) 캐릭터 표정 및 오버레이 (\`assets/characters/{id}/{female|male}/{표정}.png\`)
| 캐릭터 | 필요 표정 목록 및 오버레이 |
|---|---|
| **닭갈비 (dakgalbi)** | 기본(\`normal\`), 웃음(\`happy\`), 쓸쓸(\`sad\`), 당황(\`panic\`), 홍조 오버레이(\`blush.png\`) |
| **양념 (yangnyeom)** | 기본(\`normal\`), 웃음(\`happy\`), 멋쩍음(\`awkward\`), 쓸쓸(\`sad\`), 짜증(\`angry\`), 홍조 오버레이(\`blush.png\`) |
| **고구마 (goguma)** | 기본(\`normal\`), 웃음(\`happy\`), 쓸쓸(\`sad\`), 당황(\`panic\`), 홍조 오버레이(\`blush.png\`) |
| **볶음밥 (bokkeumbap)** | 기본(\`normal\`), 슬픔/아련(\`sad\`), 홍조 오버레이(\`blush.png\`) |

---

## 4. 파싱된 전체 장면 목록
${allScenes.map(s => `- \`${s.id}\`: ${s.title} (대사 ${s.dialogues ? s.dialogues.length : 0}개)`).join('\n')}
`;

fs.writeFileSync(path.join(rootDir, 'data', '_import_report.md'), reportMd, 'utf8');
console.log(`[import_story] 변환 완료! 총 ${report.sceneCount}개 장면 생성, data/_import_report.md 작성됨.`);
