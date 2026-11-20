# 오이데 (춘천에서 5명의 이상한 데이트) — 비주얼 노벨 웹 게임

대학 수업 과제용 미연시(비주얼 노벨) 웹 게임 "오이데" 엔진입니다.  
`오이데_스토리_정리본.md`를 데이터(JSON)로 자동 파싱하여 구동되며, 별도의 빌드 도구 없이 바닐라 HTML/CSS/JavaScript만으로 실행됩니다.  
일러스트 및 음원이 아직 없더라도 이름표가 붙은 SVG 실루엣과 임시 화면으로 끝까지 완벽하게 플레이할 수 있습니다.

---

## 1. 프로젝트 폴더 구조

```text
.
├── index.html                   # 게임 실행 화면 (16:9 반응형 뷰포트, 모달 및 뷰)
├── README.md                    # 개발 가이드, 설정 위치, 이미지 교체 표
├── 오이데_스토리_정리본.md       # 스토리 원문 마크다운 (PDF 기반 정리본)
├── css/
│   └── main.css                 # 16:9 레터박스, 대사창(V.O./O.S.), 말풍선 UI, 홍조, 디버그 스타일
├── js/
│   ├── utils.js                 # 한국어 조사 자동 교정기(은/는, 이/가 등), 변수 치환기
│   ├── audio.js                 # BGM/SFX 재생 관리 (파일 부재 시 무음 자동 처리)
│   ├── save.js                  # localStorage 기반 세이브/로드(슬롯 3개), 플레이어/성별/고민상태 저장
│   ├── renderer.js              # DOM 조작, 텍스트 타이핑, 홍조 오버레이, 말풍선 채팅 UI
│   ├── engine.js                # 게임 상태 머신, 이름 치환, 엔딩/히든 판정, 장면 점프
│   ├── ui.js                    # 클릭, 키보드(Space, Enter, D, Esc), 모달 및 디버그 점프 제어
│   └── main.js                  # 엔트리포인트 (초기화 및 디버그 window.game 노출)
├── config/                      # 전역 게임 설정 폴더
│   ├── game_config.json         # 성별/이름 설정, 히든 언락 모드, 엔딩 기준치, 씬 목록
│   ├── characters.json          # 성별별 캐릭터 이름, 테마 색상, 히든 캐릭터 여부
│   └── score_scale.json         # 호감도 등급별 수치 매핑표 (크게↑: +6, ↑: +4 등)
├── data/
│   ├── _import_report.md        # 스토리 파싱 보고서 (⚠ 확인 필요 항목, 통계, 이미지 목록)
│   ├── characters/              # 캐릭터별 메타데이터
│   └── scenes/                  # 33개 장면 JSON 파일 (프롤로그 ~ 남이섬 ~ 최종 선택 ~ 엔딩 5종)
├── tools/
│   ├── import_story.js          # 스토리 md 파일 -> data/ JSON 변환 스크립트
│   └── verify_engine.js         # 엔진 무결성 검증 스크립트 (32/32 테스트 자동화)
└── assets/
    ├── backgrounds/             # 배경 이미지 폴더 ({배경id}.png)
    ├── characters/              # 캐릭터 입화 폴더 ({id}/{female|male}/{표정}.png, blush.png)
    ├── bgm/                     # BGM 음원 파일 폴더 ({bgmId}.mp3)
    └── sfx/                     # 효과음 음원 파일 폴더 ({sfxId}.mp3)
```

---

## 2. 로컬 웹 서버 실행 방법

브라우저의 JSON fetch 보안 정책(CORS)으로 인해 로컬 웹 서버를 통해 실행해야 합니다.

### 방법 A. Python 3 (가장 간편)
터미널에서 프로젝트 디렉터리로 이동 후 다음 명령어를 실행합니다:
```bash
# Python 3 내장 웹 서버 실행
python3 -m http.server 8000
```
브라우저에서 [http://localhost:8000](http://localhost:8000) 접속

### 방법 B. Node.js (npx serve)
```bash
npx serve .
```

### 방법 C. VS Code Live Server
- VS Code에서 `index.html` 파일을 우클릭하고 **`Open with Live Server`** 선택

---

## 3. 스토리 갱신 및 데이터 재변환 방법

`오이데_스토리_정리본.md`의 내용이나 대사가 갱신되었을 경우, 아래 스크립트를 실행하기만 하면 자동으로 `data/scenes/`와 설정 파일, 변환 보고서가 즉시 갱신됩니다:

```bash
node tools/import_story.js
```

엔진 연결성 및 조사 처리 무결성 테스트 실행:
```bash
node tools/verify_engine.js
```

---

## 4. 설정값 위치 및 수치 규칙

모든 수치, 기준치, 플래그는 코드에 하드코딩되지 않고 `config/` 디렉터리의 파일에서 관리됩니다:

### 1) `config/score_scale.json` (호감도 환산 기준)
원문의 감성 표기를 아래 수치로 자동 환산합니다:
```json
{
  "크게↑": 6,
  "↑": 4,
  "소폭↑": 2,
  "소폭↓": -2,
  "(+)": 3,
  "변화 적음": 0
}
```

### 2) `config/characters.json` (이름 치환 표)
플레이어가 선택한 성별에 따라 등장인물의 이름이 자동 치환됩니다:
- **여성판 데이트 상대**: 다곡희(닭갈비), 양연미(양념), 고규미(고구마), 박복은(볶음밥)
- **남성판 데이트 상대**: 다고길(닭갈비), 양연우(양념), 고구민(고구마), 박복검(볶음밥)

### 3) `config/game_config.json` (엔딩 기준치 및 히든 언락 조건)
- `hidden_unlock.mode`:
  - `"all_three"` (기본): 닭갈비, 양념, 고구마의 호감도가 모두 `hidden_all_three_each`(기본 6) 이상일 때 선착장에서 볶음밥 등장 (정리본 기준)
  - `"reunion_temp"`: 플레이어에게 숨겨진 별도 수치 `reunion_temp`가 기준치 이상일 때 등장
- `endingThresholds`:
  - `dakgalbi`: 8 (최종 선택 시 닭갈비 버튼 활성화 기준)
  - `yangnyeom`: 8 (최종 선택 시 양념 버튼 활성화 기준)
  - `goguma`: 8 (최종 선택 시 고구마 버튼 활성화 기준)
- `flags`:
  - `day1_repeat.messages_each_visit`: 장소마다 메시지 장면 반복 (기본 `true`)
  - `day2.meet_all_three`: Day 2에서 세 명을 모두 만날지 여부 (기본 `false`: 선택한 1명)

---

## 5. 개발자 디버그 모드 사용법

- 인게임 플레이 도중 키보드 **`D`** 키를 누르면 좌측 상단에 개발자 디버그 패널이 열립니다.
- **디버그 패널 표시 내용**:
  - 현재 플레이어 이름 및 성별 모드
  - 현재 장면 ID (`sceneId`) 및 대사 번호
  - 각 캐릭터별 실시간 호감도 (`dakgalbi`, `yangnyeom`, `goguma`)
  - 히든 수치 `reunion_temp` (재회온도)
  - 히든 판정 해금 상태 (`해금됨(A)` / `미해금(B)`)
  - 각 캐릭터별 고민 상태 (`troubleStates`)
- **장면 점프 (Scene Jump)**:
  - 디버그 패널 내의 드롭다운 목록에서 이동하고 싶은 장면(예: `s14_pier_sunset`, `s15_final_choice`, 엔딩 씬 등)을 선택하고 **[해당 장면으로 이동]** 버튼을 누르면 즉시 점프하여 원하는 구간을 테스트할 수 있습니다.
- 브라우저 개발자 도구 콘솔(`F12`)에서 `window.game` 객체를 통해 직접 내부 상태를 조작할 수 있습니다:
  ```javascript
  // 수치 강제 변경 테스트 예시
  window.game.engine.state.affinity.dakgalbi = 10;
  window.game.engine.state.affinity.yangnyeom = 10;
  window.game.engine.state.affinity.goguma = 10;
  ```

---

## 6. 대사 진행 및 단축키 안내

- **글자 출력 중 클릭 / Space / Enter**: 타이핑을 즉시 중단하고 대사 전체를 한 번에 표시합니다.
- **대사 전체 표시 후 클릭 / Space / Enter**: 다음 대사로 넘어갑니다. (1회 입력당 1동작만 수행)
- **선택지 활성화 상태**: 키보드/마우스의 대사 넘김이 차단되며, 오직 선택지 버튼 클릭만 유효합니다.
- **자동 진행 (Auto)**: 대사가 모두 표시된 후 설정된 딜레이(기본 2초) 뒤 다음 대사로 자동 진행됩니다.
- **스킵 모드 (Skip)**: 이미 본 대사(`seenDialogues`)는 타이핑 효과 없이 즉시 고속으로 넘깁니다. 선택지를 만나면 자동으로 멈춥니다.
- **Esc 키**: 열려있는 세이브/로드/설정/기록실 모달을 닫습니다.

---

## 7. 필요한 이미지 및 음원 리소스 목록표

실제 일러스트와 음원 파일이 아직 없는 경우에도, 엔진은 **SVG 실루엣(이름표 포함) 및 단색 배경**으로 자동 대체하여 에러 없이 부드럽게 동작합니다.  
나중에 아래 파일들을 해당 폴더에 넣기만 하면 즉시 실제 일러스트로 교체됩니다.

### 배경 이미지 (`assets/backgrounds/`)
| 파일 경로 | 대응 원문 배경 및 설명 |
|:---|:---|
| `assets/backgrounds/bg_black.png` | 암전 화면 / 페이드 배경 |
| `assets/backgrounds/bg_train_window.png` | 열차 창밖 풍경 이미지 |
| `assets/backgrounds/bg_phone_screen.png` | 휴대폰 화면 / 캠페인 영상 / 채팅 목록 |
| `assets/backgrounds/bg_chuncheon_station.png` | 춘천역 이미지 |
| `assets/backgrounds/bg_brochure.png` | 안내책자 이미지 (블러) |
| `assets/backgrounds/bg_legoland.png` | 레고랜드 입구 이미지 |
| `assets/backgrounds/bg_skywalk.png` | 소양강 스카이워크 이미지 |
| `assets/backgrounds/bg_myeongdong.png` | 춘천 명동 닭갈비 골목 / 명동 거리 이미지 |
| `assets/backgrounds/bg_hotel.png` | 숙소 내부 (밤 / 아침) 이미지 |
| `assets/backgrounds/bg_chuncheon_city.png` | 춘천 시내 이미지 |
| `assets/backgrounds/bg_cafe.png` | 고구마의 카페 입구 / 카페 안 이미지 |
| `assets/backgrounds/bg_pier.png` | 춘천 선착장 맑은 아침 이미지 |
| `assets/backgrounds/bg_boat.png` | 수상버스 뱃길 / 갑판 / 선내 / 선미 이미지 |
| `assets/backgrounds/bg_namiseom.png` | 남이섬 메타세쿼이아길, 산책로, 은행나무길 |
| `assets/backgrounds/bg_sunset_pier.png` | 노을/해질녘 춘천 선착장 이미지 |
| `assets/backgrounds/bg_night_sky.png` | 밤하늘 이미지 |

### 캐릭터 입화 이미지 (`assets/characters/{id}/{female|male}/{표정}.png`)
*규격 권장: 세로 600~1000px 투명 배경 PNG*

| 캐릭터 ID | 여성판 이름 | 남성판 이름 | 필요 표정 목록 및 오버레이 파일 |
|:---|:---|:---|:---|
| **dakgalbi** | 다곡희 | 다고길 | 기본(`normal`), 웃음(`happy`), 쓸쓸(`sad`), 당황(`panic`), 홍조 오버레이(`blush.png`) |
| **yangnyeom** | 양연미 | 양연우 | 기본(`normal`), 웃음(`happy`), 멋쩍음(`awkward`), 쓸쓸(`sad`), 짜증(`angry`), 홍조 오버레이(`blush.png`) |
| **goguma** | 고규미 | 고구민 | 기본(`normal`), 웃음(`happy`), 쓸쓸(`sad`), 당황(`panic`), 홍조 오버레이(`blush.png`) |
| **bokkeumbap** | 박복은 | 박복검 | 기본(`normal`), 슬픔/아련(`sad`), 홍조 오버레이(`blush.png`) |

### 음원 파일 (`assets/bgm/`, `assets/sfx/`)
| 파일 경로 | 용도 |
|:---|:---|
| `assets/bgm/bgm_main.mp3` | 메인 테마 (일상/춘천역/거리) |
| `assets/bgm/bgm_evening.mp3` | 저녁/숙소/감성 테마 |
| `assets/bgm/bgm_ending.mp3` | 엔딩/황혼 테마 |
| `assets/sfx/sfx_train.mp3` | 열차 효과음 |
| `assets/sfx/sfx_click.mp3` | 버튼 클릭 효과음 |

---

## 8. 확인 필요 항목 (원문 보고서 발췌)

자세한 분석 내용은 [data/_import_report.md](file:///Users/kakajae/Desktop/2026-2학기/디자인씽킹/춘천에서%205명의%20이상한%20데이트%28오이데%29/data/_import_report.md)에 모두 정리되어 있습니다.
1. **엔딩 원고**: 현재 최종 선택 이후 5개 엔딩(닭갈비, 양념, 고구마, 볶음밥, 혼자)은 `[누락] 엔딩 원고 필요` 임시 장면으로 등록되어 있습니다. 추후 원고가 나오면 `data/scenes/ending_*.json`에 텍스트만 채워 넣으시면 됩니다.
2. **Day 2 진행 방식**: "누구에게 먼저 연락해볼까?"에서 한 명만 만나는 구조(`config.flags.day2.meet_all_three: false`)가 기본값으로 적용되어 있습니다.
3. **히든 해금 모드**: 3명 호감도 모두 충족(`all_three`)이 기본값이며, `reunion_temp`(재회온도) 모드로도 config에서 손쉽게 전환할 수 있습니다.
