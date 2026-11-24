/**
 * tools/import_story.js
 * '미연시_전체스토리_구현명세.md'를 유일한 기준으로 파싱하여
 * data/scenes/*.json, config/game_config.json, config/characters.json, data/_import_report.md를 생성한다.
 * 기존 스토리 씬 파일은 전부 삭제한 뒤 새로 생성한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const specPath = path.join(rootDir, '미연시_전체스토리_구현명세.md');

if (!fs.existsSync(specPath)) {
  console.error(`[import_story] 명세 파일을 찾을 수 없습니다: ${specPath}`);
  process.exit(1);
}

const rawMd = fs.readFileSync(specPath, 'utf8');
const lines = rawMd.split(/\r?\n/);

const CHAR_ID_MAP = {
  '닭고기': 'dakgalbi',
  '닭갈비': 'dakgalbi',
  '양념': 'yangnyeom',
  '고구마': 'goguma',
  '볶음밥': 'bokkeumbap',
};

const ROLE_NAME = {
  dakgalbi: '닭갈비',
  yangnyeom: '양념',
  goguma: '고구마',
  bokkeumbap: '볶음밥',
};

const STORY_VERSION = 'v2_full_spec';

// 텍스트의 대괄호 플레이스홀더([주인공], [닭고기], [양념], [고구마], [볶음밥])를 표준 중괄호로 정규화
// 단, 원문 문구는 한 글자도 변경하지 않는다.
function normalizePlaceholders(text) {
  if (!text) return '';
  return text
    .replace(/\[주인공\]/g, '{player}')
    .replace(/\[닭고기\]/g, '{닭갈비}')
    .replace(/\[닭갈비\]/g, '{닭갈비}')
    .replace(/\[양념\]/g, '{양념}')
    .replace(/\[고구마\]/g, '{고구마}')
    .replace(/\[볶음밥\]/g, '{볶음밥}');
}

function stripOuterQuotes(s) {
  let t = (s || '').trim();
  if (/^["“”]/.test(t)) t = t.slice(1);
  if (/["“”]$/.test(t)) t = t.slice(0, -1);
  return t.trim();
}

// 배경 지시 라인 판별 및 매핑 (문서 5-3 기준)
function parseBackgroundDirective(line) {
  const t = line.trim();
  if (t === '검정 화면') return { bg: 'bg_black', overlay: null };
  if (t.startsWith('창밖 풍경')) return { bg: 'bg_train_window', overlay: null };
  if (t.startsWith('휴대폰 화면')) return { bg: 'bg_phone_screen', overlay: null };
  if (t.startsWith('춘천역')) return { bg: 'bg_chuncheon_station', overlay: null };
  if (t.startsWith('안내책자')) return { bg: 'bg_brochure', overlay: t.includes('블러') ? 'blur' : null };
  if (t.startsWith('레고랜드 입구')) return { bg: 'bg_legoland', overlay: null };
  if (t.startsWith('소양강 스카이워크')) return { bg: 'bg_skywalk', overlay: null };
  if (t.startsWith('춘천 명동 닭갈비 골목') || t.startsWith('명동 거리') || t.startsWith('다른 명동 거리')) {
    return { bg: 'bg_dakgalbi_alley', overlay: null };
  }
  if (t.startsWith('춘천 시내')) return { bg: 'bg_street_statue', overlay: null };
  if (t.startsWith('카페 입구') || t.startsWith('화면 전환 → 카페 입구')) return { bg: 'bg_cafe_entrance', overlay: null };
  if (t.startsWith('카페 안')) return { bg: 'bg_cafe', overlay: null };
  if (t.startsWith('숙소 내부 / 밤')) return { bg: 'bg_hotel', overlay: 'night' };
  if (t.startsWith('숙소 내부 / 아침')) return { bg: 'bg_hotel', overlay: null };
  if (t.startsWith('사람들이 많이 있는 선착장')) return { bg: 'bg_pier', overlay: null };
  if (t.startsWith('닭고기가 나오는 전광판 홍보 영상')) return { bg: 'bg_promo_video', overlay: null };
  if (t.startsWith('수상버스 안 / 해질녘')) return { bg: 'bg_nami_boat_interior', overlay: 'sunset' };
  if (t.startsWith('수상버스 안')) return { bg: 'bg_nami_boat_interior', overlay: null };
  if (t.startsWith('메타세쿼이아길')) return { bg: 'bg_metasequoia_road', overlay: null };
  if (t.startsWith('호숫가 산책로')) return { bg: 'bg_nami_riverside_walk', overlay: null };
  if (t.startsWith('은행나무길')) return { bg: 'bg_ginkgo_road', overlay: null };
  if (t.startsWith('남이섬 선착장 / 해질녘')) return { bg: 'bg_nami_entrance', overlay: 'sunset' };
  if (t.startsWith('춘천 선착장 / 해질녘')) return { bg: 'bg_pier', overlay: 'sunset' };
  return null;
}

// 페이드/효과음 등 연출 라인 판별
function isVisualDirective(line) {
  const t = line.trim();
  if (/^(페이드|흰색 페이드|긴 흰색 페이드|길게 검정 페이드|천천히 페이드 아웃)/.test(t)) return true;
  if (/^효과음\s*:/.test(t)) return true;
  if (/^\((약간의 텀|텀)\)$/.test(t)) return true;
  return false;
}

function cloneChars(list) {
  return (list || []).map(c => ({ ...c }));
}

function upsertActiveChar(activeChars, id, expr) {
  const existing = activeChars.find(c => c.id === id);
  if (existing) {
    existing.expression = expr || existing.expression || '기본';
  } else {
    activeChars.push({ id, position: 'center', expression: expr || '기본' });
  }
  if (activeChars.length === 1) {
    activeChars[0].position = 'center';
  } else if (activeChars.length === 2) {
    activeChars[0].position = 'left';
    activeChars[1].position = 'right';
  } else if (activeChars.length >= 3) {
    activeChars[0].position = 'left';
    activeChars[1].position = 'center';
    activeChars[2].position = 'right';
  }
}

// 대사 한 줄 파싱
function parseDialogueLine(rawLine, state) {
  const line = rawLine.trim();
  if (!line) return null;

  // 채팅 목록 지시 (#6, #7, #8) — 이미지 대신 코드 UI로 표시
  if (line.startsWith('채팅 목록')) {
    state.activeChars = [];
    if (state.sceneId === 's08_day2_end') {
      state.chatListMode = 'day2_step0';
    } else {
      state.chatListMode = 'day1';
    }
    return null;
  }

  // 배경 지시
  const bgDir = parseBackgroundDirective(line);
  if (bgDir) {
    state.pendingBg = bgDir.bg;
    state.pendingOverlay = bgDir.overlay;
    state.activeChars = [];
    if (bgDir.bg === 'bg_black') state.chatListMode = null;
    if (!state.initialBg) {
      state.initialBg = bgDir.bg;
      state.initialOverlay = bgDir.overlay;
    }
    // 전광판 홍보 영상은 자막 연출도 함께 기록
    if (bgDir.bg === 'bg_promo_video') {
      const subM = line.match(/자막:\s*([^)]+)/);
      if (subM) {
        return {
          speaker: null,
          speakerType: 'narration',
          text: subM[1].trim(),
          characters: [],
          background: bgDir.bg,
          overlay: bgDir.overlay,
        };
      }
    }
    return null;
  }

  // 페이드/효과음 연출
  if (isVisualDirective(line)) {
    if (line.includes('검정 화면')) {
      state.pendingBg = 'bg_black';
      state.pendingOverlay = null;
      state.chatListMode = null;
    } else if (line.includes('→ 창밖 풍경')) {
      state.pendingBg = 'bg_train_window';
      state.pendingOverlay = null;
    } else if (line.includes('→ 휴대폰 화면')) {
      if (state.sceneId === 's08_day2_end') {
        state.pendingBg = 'bg_hotel';
        state.pendingOverlay = 'night';
        state.chatListMode = 'day2_step3';
      } else {
        state.pendingBg = 'bg_phone_screen';
        state.pendingOverlay = null;
      }
    }
    if (/^효과음\s*:/.test(line)) {
      const sfxName = line.replace(/^효과음\s*:/, '').trim();
      state.pendingSfx = sfxName;
    }
    if (/페이드/.test(line)) {
      state.pendingFade = line.includes('흰') ? 'white' : 'black';
      state.activeChars = [];
    }
    return null;
  }

  const attachPending = (obj) => {
    if (state.pendingBg) {
      obj.background = state.pendingBg;
      obj.overlay = state.pendingOverlay ?? null;
      state.pendingBg = null;
      state.pendingOverlay = null;
    }
    if (state.pendingSfx) {
      obj.sfx = state.pendingSfx;
      state.pendingSfx = null;
    }
    if (state.pendingFade) {
      obj.fade = state.pendingFade;
      state.pendingFade = null;
    }
    if (state.chatListMode && state.chatListMode !== 'day2_step0') {
      obj.chatList = state.chatListMode;
    }
    return obj;
  };

  // *( ... )* 지문 / 나레이션
  const stageM = line.match(/^\*\((.*)\)\*$/);
  if (stageM) {
    const inner = normalizePlaceholders(stageM[1].trim());
    // "사라진다" 지문이면 캐릭터 퇴장 처리
    if (inner.includes('사라진다')) {
      state.activeChars = [];
    }
    return attachPending({
      speaker: null,
      speakerType: 'narration',
      text: inner,
      characters: cloneChars(state.activeChars),
    });
  }

  // 동시 발화: 고구마(놀람), 양념(놀람): ...[주인공]씨?
  const dualM = line.match(/^(닭고기|양념|고구마|볶음밥)\(([^)]+)\),\s*(닭고기|양념|고구마|볶음밥)\(([^)]+)\):\s*(.*)$/);
  if (dualM) {
    const id1 = CHAR_ID_MAP[dualM[1]];
    const expr1 = dualM[2].trim();
    const id2 = CHAR_ID_MAP[dualM[3]];
    const expr2 = dualM[4].trim();
    const text = normalizePlaceholders(dualM[5].trim());
    upsertActiveChar(state.activeChars, id1, expr1);
    upsertActiveChar(state.activeChars, id2, expr2);
    return attachPending({
      speaker: `{${ROLE_NAME[id1]}}, {${ROLE_NAME[id2]}}`,
      speakerType: 'normal',
      text,
      characters: cloneChars(state.activeChars),
    });
  }

  // 일반 대사: 화자(태그1)(태그2)...: 대사
  const m = line.match(/^([^:]+?):\s*(.*)$/);
  if (!m) return null;

  let rawSpeaker = m[1].trim();
  const text = normalizePlaceholders(m[2].trim());
  let speakerType = 'normal';
  let textLarge = false;

  if (rawSpeaker.includes('(텍스트 크게)')) {
    textLarge = true;
    rawSpeaker = rawSpeaker.replace('(텍스트 크게)', '').trim();
  }

  // (영상)닭고기
  if (rawSpeaker.startsWith('(영상)')) {
    const who = rawSpeaker.replace('(영상)', '').trim();
    const cid = CHAR_ID_MAP[who];
    if (cid) upsertActiveChar(state.activeChars, cid, '웃음');
    return attachPending({
      speaker: cid ? `영상 속 ${ROLE_NAME[cid]}` : rawSpeaker,
      speakerType: 'normal',
      text,
      characters: cloneChars(state.activeChars),
    });
  }

  // ???(캐릭터)(표정/O.S.) 또는 ???(V.O.) 또는 ???(O.S.)
  if (rawSpeaker.startsWith('???')) {
    const tags = [...rawSpeaker.matchAll(/\(([^)]+)\)/g)].map(x => x[1].trim());
    let cid = null;
    let expr = '기본';
    for (const tag of tags) {
      if (tag === 'V.O.') speakerType = 'vo';
      else if (tag === 'O.S.') speakerType = 'os';
      else if (CHAR_ID_MAP[tag]) cid = CHAR_ID_MAP[tag];
      else expr = tag;
    }
    if (cid && speakerType !== 'os' && speakerType !== 'vo') {
      upsertActiveChar(state.activeChars, cid, expr);
    }
    const obj = {
      speaker: '???',
      speakerType,
      text,
      characters: cloneChars(state.activeChars),
    };
    if (cid) obj.speakerId = cid;
    if (textLarge) obj.textLarge = true;
    return attachPending(obj);
  }

  // 주인공(V.O.) / 주인공(O.S.) / 주인공 — 직전 캐릭터 스프라이트와 마지막 표정 유지
  if (rawSpeaker.startsWith('주인공')) {
    if (rawSpeaker.includes('(V.O.)')) speakerType = 'vo';
    else if (rawSpeaker.includes('(O.S.)')) speakerType = 'os';
    const obj = {
      speaker: '주인공',
      speakerType,
      text,
      characters: cloneChars(state.activeChars),
    };
    if (textLarge) obj.textLarge = true;
    return attachPending(obj);
  }

  // 영상 내레이션 / 안내방송 / 승선 안내 방송
  if (rawSpeaker === '영상 내레이션') {
    return attachPending({ speaker: null, speakerType: 'narration', text, characters: cloneChars(state.activeChars) });
  }
  if (rawSpeaker.startsWith('안내방송') || rawSpeaker.startsWith('승선 안내 방송')) {
    return attachPending({
      speaker: '안내방송',
      speakerType: 'os',
      text,
      characters: cloneChars(state.activeChars),
    });
  }

  // 캐릭터(표정) 또는 캐릭터
  const charM = rawSpeaker.match(/^(닭고기|닭갈비|양념|고구마|볶음밥)(?:\(([^)]+)\))?$/);
  if (charM) {
    const cid = CHAR_ID_MAP[charM[1]];
    const expr = charM[2] ? charM[2].trim() : '기본';

    // #8 Day 2 밤 채팅 목록 도착 메시지 (스프라이트 없이 채팅 목록에 차례로 추가)
    if (state.sceneId === 's08_day2_end' && state.chatListMode && state.chatListMode.startsWith('day2_')) {
      if (cid === 'dakgalbi') state.chatListMode = 'day2_step1';
      else if (cid === 'yangnyeom') state.chatListMode = 'day2_step2';
      else if (cid === 'goguma') state.chatListMode = 'day2_step3';
      return attachPending({
        speaker: ROLE_NAME[cid],
        speakerType: 'normal',
        text,
        characters: [],
      });
    }

    upsertActiveChar(state.activeChars, cid, expr);
    const obj = {
      speaker: ROLE_NAME[cid],
      speakerType: 'normal',
      text,
      characters: cloneChars(state.activeChars),
    };
    if (textLarge) obj.textLarge = true;
    return attachPending(obj);
  }

  return attachPending({
    speaker: rawSpeaker,
    speakerType,
    text,
    characters: cloneChars(state.activeChars),
  });
}

// 마크다운 블록(라인 배열)을 대사 + 인라인 단일버튼 + 인라인 선택화면으로 파싱
function parseSectionLines(secLines, { charId = null, sceneId = 'scene', buttonGivesLike = false } = {}) {
  const dialogues = [];
  const state = {
    sceneId,
    initialBg: null,
    initialOverlay: null,
    pendingBg: null,
    pendingOverlay: null,
    pendingSfx: null,
    pendingFade: null,
    activeChars: [],
    chatListMode: null,
  };
  let singleCount = 0;
  let choiceCount = 0;
  let endingTitle = null;

  let i = 0;
  while (i < secLines.length) {
    const raw = secLines[i];
    const trimmed = raw.trim();

    // 구현 메모 무시 (화면 표시 금지)
    if (trimmed.startsWith('>')) { i++; continue; }

    // 엔딩 제목: **엔딩: ...**
    const endTitleM = trimmed.match(/^\*\*엔딩:\s*(.+?)\*\*(.*)$/);
    if (endTitleM) {
      endingTitle = endTitleM[1].trim();
      i++;
      continue;
    }

    // [버튼] 문구 (+2) 또는 [버튼] 문구 (0) 또는 [버튼] 문구
    const btnM = trimmed.match(/^\[버튼\]\s*(.+?)(?:\s*\((?:\+(\d+)|0)\))?$/);
    if (btnM) {
      singleCount++;
      const btnText = normalizePlaceholders(stripOuterQuotes(btnM[1]));
      const pts = btnM[2] ? parseInt(btnM[2], 10) : 0;
      const effects = (pts > 0 && charId)
        ? { like: { [charId]: pts }, compact: buttonGivesLike, labelMode: buttonGivesLike ? 'up' : null }
        : null;
      dialogues.push({
        type: 'choice',
        id: `single_${sceneId}_${singleCount}`,
        question: '',
        single: true,
        options: [
          {
            key: 'A',
            text: btnText,
            next: null,
            effectDesc: '',
            effects,
            followUp: [],
          },
        ],
      });
      dialogues.push({
        speaker: '주인공',
        speakerType: 'os',
        text: btnText,
        characters: cloneChars(state.activeChars),
      });
      i++;
      continue;
    }

    // **[선택 화면]** (둘 중 하나)
    if (/^\*\*\[선택 화면\]\*\*/.test(trimmed)) {
      choiceCount++;
      const options = [];
      i++;
      while (i < secLines.length) {
        const cur = secLines[i].trim();
        if (!cur) { i++; continue; }
        if (cur.startsWith('공통') || cur.startsWith('>') || cur.startsWith('###') || cur.startsWith('####')) break;
        const optM = cur.match(/^-\s*(.+?)(?:\s*\((?:\+(\d+)|0)\))?$/);
        if (optM) {
          let rawOptText = optM[1].trim();
          let pts = 0;
          const scoreInCur = cur.match(/\(\+(\d+)\)\s*$/);
          if (scoreInCur) pts = parseInt(scoreInCur[1], 10);
          rawOptText = rawOptText.replace(/\s*\((?:\+\d+|0)\)\s*$/, '').trim();
          const optText = normalizePlaceholders(stripOuterQuotes(rawOptText));

          // 이 옵션 아래의 ```script ... ``` 블록 수집
          const followUp = [];
          let optEndingTitle = null;
          i++;
          while (i < secLines.length) {
            const sub = secLines[i].trim();
            if (!sub) { i++; continue; }
            if (sub.startsWith('```')) {
              i++;
              const fState = {
                sceneId,
                initialBg: null,
                initialOverlay: null,
                pendingBg: null,
                pendingOverlay: null,
                pendingSfx: null,
                pendingFade: null,
                activeChars: cloneChars(state.activeChars),
                chatListMode: null,
              };
              while (i < secLines.length && !secLines[i].trim().startsWith('```')) {
                const d = parseDialogueLine(secLines[i], fState);
                if (d) followUp.push(d);
                i++;
              }
              if (i < secLines.length && secLines[i].trim().startsWith('```')) i++;
              continue;
            }
            const subEnd = sub.match(/^\*\*엔딩:\s*(.+?)\*\*(.*)$/);
            if (subEnd) {
              optEndingTitle = subEnd[1].trim();
              i++;
              continue;
            }
            break;
          }

          const isDay12PairChoice = buttonGivesLike && choiceCount === 1;
          const finalFollowUp = isDay12PairChoice
            ? [{ speaker: '주인공', speakerType: 'os', text: optText, characters: cloneChars(state.activeChars) }, ...followUp]
            : followUp;

          const optEffects = (pts > 0 && charId)
            ? (isDay12PairChoice
                ? { like: { [charId]: pts }, compact: true, labelMode: 'up' }
                : { like: { [charId]: pts } })
            : null;

          options.push({
            key: String.fromCharCode(65 + options.length),
            text: optText,
            next: null,
            effectDesc: '',
            effects: optEffects,
            followUp: finalFollowUp,
            endingTitle: optEndingTitle,
          });
          continue;
        }
        break;
      }

      if (options.length > 0) {
        dialogues.push({
          type: 'choice',
          id: `choice_${sceneId}_${choiceCount}`,
          question: '',
          options,
        });
      }
      continue;
    }

    // ```script ... ``` 블록
    if (trimmed.startsWith('```')) {
      i++;
      while (i < secLines.length && !secLines[i].trim().startsWith('```')) {
        const d = parseDialogueLine(secLines[i], state);
        if (d) dialogues.push(d);
        i++;
      }
      if (i < secLines.length && secLines[i].trim().startsWith('```')) i++;
      continue;
    }

    i++;
  }

  return {
    dialogues,
    background: state.initialBg || 'bg_black',
    overlay: state.initialOverlay || null,
    endingTitle,
  };
}

// 명세서 6번(씬 본문)을 헤더별로 분할
function extractSections(mdLines) {
  const sections = {};
  let currentKey = null;
  let inCode = false;
  let inChapter6 = false;

  for (const line of mdLines) {
    if (line.startsWith('## 6. 씬 본문')) { inChapter6 = true; continue; }
    if (inChapter6 && line.startsWith('## 7.')) break;
    if (!inChapter6) continue;

    if (line.trim().startsWith('```')) inCode = !inCode;
    if (!inCode && /^#{3,4}\s+/.test(line)) {
      currentKey = line.trim();
      sections[currentKey] = [];
      continue;
    }
    if (currentKey) {
      sections[currentKey].push(line);
    }
  }
  return sections;
}

const S = extractSections(lines);
const getSec = (prefix) => {
  const k = Object.keys(S).find(key => key.startsWith(prefix));
  if (!k) throw new Error(`[import_story] 섹션을 찾을 수 없습니다: ${prefix}`);
  return S[k];
};

const allScenes = [];
const pushScene = (scene) => { allScenes.push(scene); };

// ── #1 프롤로그 ──
{
  const p = parseSectionLines(getSec('### #1 프롤로그'), { sceneId: 's01_prologue' });
  pushScene({
    id: 's01_prologue',
    title: '#1 프롤로그',
    type: 'normal',
    day: 1,
    background: p.background,
    overlay: p.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: 's02_place_select',
  });
}

// ── #2 장소 선택 ──
{
  const sec = getSec('### #2 장소 선택');
  // 선택 화면 앞/뒤 대사 분리
  const choiceIdx = sec.findIndex(l => l.trim().startsWith('**[선택 화면]'));
  const before = parseSectionLines(sec.slice(0, choiceIdx), { sceneId: 's02_place_select' });
  const after = parseSectionLines(sec.slice(choiceIdx + 1), { sceneId: 's02_place_select_after' });
  // after 대사("그래. 첫날은 여기부터 가는거야.")는 선택 직후 followUp으로 재생
  const postLine = after.dialogues;
  pushScene({
    id: 's02_place_select',
    title: '#2 장소 선택',
    type: 'normal',
    day: 1,
    background: before.background,
    overlay: before.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: before.dialogues,
    choices: {
      id: 'place_1',
      question: '장소 선택',
      options: [
        { key: 'A', placeKey: 'lego', text: '레고랜드 — 다양한 놀이기구와 볼거리가 있는 테마파크', next: 's03_lego', followUp: postLine },
        { key: 'B', placeKey: 'skywalk', text: '스카이워크 — 탁 트인 강 풍경을 감상할 수 있는 명소', next: 's03_skywalk', followUp: postLine },
        { key: 'C', placeKey: 'myeongdong', text: '명동 닭갈비 골목 — 춘천의 대표 먹거리를 즐길 수 있는 거리', next: 's03_myeongdong', followUp: postLine },
      ],
    },
    next: null,
  });
}

// ── #3-1 Day 1 첫 만남 (3개 루트) ──
const day1Routes = [
  { key: '#### 레고랜드 선택 시', id: 's03_lego', title: '#3-1 Day 1 — 레고랜드 (닭고기)', charId: 'dakgalbi', phoneId: 's03_lego_phone' },
  { key: '#### 소양강 스카이워크 선택 시', id: 's03_skywalk', title: '#3-1 Day 1 — 스카이워크 (고구마)', charId: 'goguma', phoneId: 's03_skywalk_phone' },
  { key: '#### 춘천 명동 닭갈비 골목 선택 시', id: 's03_myeongdong', title: '#3-1 Day 1 — 명동 닭갈비 골목 (양념)', charId: 'yangnyeom', phoneId: 's03_myeongdong_phone' },
];
for (const r of day1Routes) {
  const p = parseSectionLines(getSec(r.key), { charId: r.charId, sceneId: r.id, buttonGivesLike: true });
  // 실제 이름 첫 공개 지점에 reveal 플래그 설정
  for (const d of p.dialogues) {
    if (d.speaker === ROLE_NAME[r.charId] && !d.speakerId) {
      d.reveal = r.charId;
      break;
    }
  }
  pushScene({
    id: r.id,
    title: r.title,
    type: 'normal',
    day: 1,
    background: p.background,
    overlay: p.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: r.phoneId,
  });
}

// ── #3-2 Day 1 휴대폰 메시지 (3개) + 다음 장소 선택 씬 ──
{
  const sec = getSec('### #3-2 Day 1');
  const extractScriptAfter = (marker) => {
    const idx = marker ? sec.findIndex(l => l.includes(marker)) : 0;
    const start = sec.findIndex((l, k) => k >= idx && l.trim().startsWith('```'));
    const end = sec.findIndex((l, k) => k > start && l.trim().startsWith('```'));
    return sec.slice(start + 1, end);
  };
  const introLines = extractScriptAfter(null).map(l => normalizePlaceholders(l.replace(/^주인공\(V\.O\.\):\s*/, '').trim()));

  const phoneConfigs = [
    { marker: '**레고랜드 → 닭고기**', id: 's03_lego_phone', partner: 'dakgalbi', title: '#3-2 메시지 — 닭고기' },
    { marker: '**스카이워크 → 고구마**', id: 's03_skywalk_phone', partner: 'goguma', title: '#3-2 메시지 — 고구마' },
    { marker: '**명동 닭갈비 골목 → 양념**', id: 's03_myeongdong_phone', partner: 'yangnyeom', title: '#3-2 메시지 — 양념' },
  ];

  for (const pc of phoneConfigs) {
    const rawLines = extractScriptAfter(pc.marker);
    const messages = [];
    let outroVo = '';
    for (const rl of rawLines) {
      const m = rl.trim().match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const who = m[1].trim();
      const txt = normalizePlaceholders(m[2].trim());
      if (who.includes('V.O.')) outroVo = txt;
      else if (who.startsWith('주인공')) messages.push({ sender: 'player', text: txt });
      else messages.push({ sender: pc.partner, text: txt });
    }
    pushScene({
      id: pc.id,
      title: pc.title,
      type: 'phone_message',
      day: 1,
      background: 'bg_black',
      overlay: null,
      time: '낮',
      bgm: 'bgm_main',
      partner: pc.partner,
      intro_vo: introLines,
      messages,
      outro_vo: outroVo,
      next: 's03_2_day1_messages',
    });
  }

  // 다음 장소 이동 씬 (안 간 장소가 남아 있을 때만 진입)
  pushScene({
    id: 's03_2_day1_messages',
    title: '#3-2 Day 1 — 다음 장소로 이동',
    type: 'normal',
    day: 1,
    background: 'bg_brochure',
    overlay: 'blur',
    time: '낮',
    bgm: 'bgm_main',
    dialogues: [
      { speaker: '주인공', speakerType: 'vo', text: '좋아, 이제 다음 장소로 이동해 볼까?', characters: [], background: 'bg_brochure', overlay: 'blur' },
    ],
    postChoiceLine: { speaker: '주인공', speakerType: 'vo', text: '다음은 여기다!', characters: [] },
    choices: null,
    next: null,
  });
}

// ── #6 Day 1 마무리 ──
{
  const p = parseSectionLines(getSec('### #6 Day 1 마무리'), { sceneId: 's06_day1_end' });
  pushScene({
    id: 's06_day1_end',
    title: '#6 Day 1 마무리',
    type: 'normal',
    day: 1,
    background: p.background,
    overlay: p.overlay,
    time: '밤',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: 's07_day2',
  });
}

// ── #7 Day 2 시작 + 3명 개별 루트 ──
{
  const p = parseSectionLines(getSec('### #7 Day 2'), { sceneId: 's07_day2' });
  pushScene({
    id: 's07_day2',
    title: '#7 Day 2 — 가까워지는 시간',
    type: 'normal',
    day: 2,
    background: p.background,
    overlay: p.overlay,
    time: '아침',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: null,
  });
}

const day2Routes = [
  { key: '#### 닭고기를 선택할 시', id: 's07_dakgalbi', title: '#7 Day 2 — 닭고기 (춘천 시내)', charId: 'dakgalbi' },
  { key: '#### 고구마를 선택할 시', id: 's07_goguma', title: '#7 Day 2 — 고구마 (카페)', charId: 'goguma' },
  { key: '#### 양념을 선택할 시', id: 's07_yangnyeom', title: '#7 Day 2 — 양념 (명동 거리)', charId: 'yangnyeom' },
];
for (const r of day2Routes) {
  const p = parseSectionLines(getSec(r.key), { charId: r.charId, sceneId: r.id, buttonGivesLike: true });
  pushScene({
    id: r.id,
    title: r.title,
    type: 'normal',
    day: 2,
    background: p.background,
    overlay: p.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: null,
  });
}

// ── #8 Day 2 마무리 ──
{
  const p = parseSectionLines(getSec('### #8 Day 2 마무리'), { sceneId: 's08_day2_end' });
  pushScene({
    id: 's08_day2_end',
    title: '#8 Day 2 마무리',
    type: 'normal',
    day: 2,
    background: p.background,
    overlay: p.overlay,
    time: '밤',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: 's09_pier',
  });
}

// ── #9 Day 3 춘천 선착장 ──
{
  const p = parseSectionLines(getSec('### #9 Day 3'), { sceneId: 's09_pier' });
  pushScene({
    id: 's09_pier',
    title: '#9 Day 3 — 춘천 선착장',
    type: 'normal',
    day: 3,
    background: p.background,
    overlay: p.overlay,
    time: '아침',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: 's10_bus',
  });
}

// ── #10 Day 3 수상버스 ──
{
  const p = parseSectionLines(getSec('### #10 Day 3'), { sceneId: 's10_bus' });
  pushScene({
    id: 's10_bus',
    title: '#10 Day 3 — 수상버스',
    type: 'normal',
    day: 3,
    background: p.background,
    overlay: p.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: {
      id: 'bus_seat',
      question: '좌석 선택',
      options: [
        { key: 'A', charId: 'dakgalbi', text: '{닭갈비} 옆에 앉는다.', next: 's10_bus_dakgalbi', followUp: [] },
        { key: 'B', charId: 'goguma', text: '{고구마} 옆에 앉는다.', next: 's10_bus_goguma', followUp: [] },
        { key: 'C', charId: 'yangnyeom', text: '{양념} 옆에 앉는다.', next: 's10_bus_yangnyeom', followUp: [] },
      ],
    },
    next: null,
  });

  const seatRoutes = [
    { key: '#### 닭고기 선택시', id: 's10_bus_dakgalbi', charId: 'dakgalbi', title: '#10 수상버스 — 닭고기 좌석' },
    { key: '#### 양념 선택시', id: 's10_bus_yangnyeom', charId: 'yangnyeom', title: '#10 수상버스 — 양념 좌석' },
    { key: '#### 고구마 선택시', id: 's10_bus_goguma', charId: 'goguma', title: '#10 수상버스 — 고구마 좌석' },
  ];
  for (const sr of seatRoutes) {
    const sp = parseSectionLines(getSec(sr.key), { charId: sr.charId, sceneId: sr.id });
    pushScene({
      id: sr.id,
      title: sr.title,
      type: 'normal',
      day: 3,
      background: 'bg_nami_boat_interior',
      overlay: null,
      time: '낮',
      bgm: 'bgm_main',
      dialogues: sp.dialogues,
      choices: null,
      next: 's10_bus_common',
    });
  }

  const cp = parseSectionLines(getSec('#### 공통 (세 좌석 모두)'), { sceneId: 's10_bus_common' });
  pushScene({
    id: 's10_bus_common',
    title: '#10 수상버스 — 남이섬 도착',
    type: 'bus_to_island',
    day: 3,
    background: 'bg_nami_boat_interior',
    overlay: null,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: cp.dialogues,
    choices: null,
    next: null,
  });
}

// ── #11 Day 3 남이섬 (bus_choice 장소 1개만 진행) + 춘천으로 ──
const islandRoutes = [
  { key: '#### 닭고기 선택시 — 메타세쿼이아길', id: 's11_dakgalbi', charId: 'dakgalbi', title: '#11 남이섬 — 메타세쿼이아길 (닭고기)' },
  { key: '#### 양념 선택시 — 호숫가 산책로', id: 's11_yangnyeom', charId: 'yangnyeom', title: '#11 남이섬 — 호숫가 산책로 (양념)' },
  { key: '#### 고구마 선택시 — 은행나무길', id: 's11_goguma', charId: 'goguma', title: '#11 남이섬 — 은행나무길 (고구마)' },
];
for (const ir of islandRoutes) {
  const ip = parseSectionLines(getSec(ir.key), { charId: ir.charId, sceneId: ir.id });
  pushScene({
    id: ir.id,
    title: ir.title,
    type: 'normal',
    day: 3,
    background: ip.background,
    overlay: ip.overlay,
    time: '낮',
    bgm: 'bgm_main',
    dialogues: ip.dialogues,
    choices: null,
    next: 's11_return',
  });
}

{
  const rp = parseSectionLines(getSec('### #11 Day 3 — 춘천으로'), { sceneId: 's11_return' });
  pushScene({
    id: 's11_return',
    title: '#11 Day 3 — 춘천으로',
    type: 'normal',
    day: 3,
    background: rp.background,
    overlay: rp.overlay,
    time: '황혼',
    bgm: 'bgm_main',
    dialogues: rp.dialogues,
    choices: null,
    next: 's12_pier_sunset',
  });
}

// ── #12 Day 3 선택 (도착 + 판정 -> 히든 등장 장면 -> 최종 선택 화면) ──
{
  const p = parseSectionLines(getSec('### #12 Day 3'), { sceneId: 's12_pier_sunset' });
  pushScene({
    id: 's12_pier_sunset',
    title: '#12 Day 3 — 춘천 선착장 (해질녘)',
    type: 'judge',
    day: 3,
    background: p.background,
    overlay: p.overlay,
    time: '황혼',
    bgm: 'bgm_main',
    dialogues: p.dialogues,
    choices: null,
    next: null,
  });

  const hp = parseSectionLines(getSec('#### 히든 등장 장면'), { sceneId: 's12_hidden_bokkeumbap' });
  // 볶음밥 첫 실명 발화에 reveal 추가
  for (const d of hp.dialogues) {
    if (d.speaker === '볶음밥' && !d.speakerId) {
      d.reveal = 'bokkeumbap';
      break;
    }
  }
  pushScene({
    id: 's12_hidden_bokkeumbap',
    title: '#12 히든 — 볶음밥 등장',
    type: 'normal',
    day: 3,
    background: 'bg_pier',
    overlay: 'sunset',
    time: '황혼',
    bgm: 'bgm_main',
    dialogues: hp.dialogues,
    choices: null,
    next: 's12_final_choice',
  });

  pushScene({
    id: 's12_final_choice',
    title: '#12 최종 선택 화면',
    type: 'final',
    day: 3,
    background: 'bg_pier',
    overlay: 'sunset',
    time: '황혼',
    bgm: 'bgm_main',
    dialogues: [],
    choices: null,
    next: null,
  });
}

// ── 엔딩 6종 ──
const singleEndings = [
  { key: '#### 닭고기 엔딩', id: 'ending_dakgalbi', title: '닭고기 엔딩', charId: 'dakgalbi', bg: 'bg_pier', overlay: 'sunset' },
  { key: '#### 양념 엔딩', id: 'ending_yangnyeom', title: '양념 엔딩', charId: 'yangnyeom', bg: 'bg_pier', overlay: 'sunset' },
  { key: '#### 고구마 엔딩', id: 'ending_goguma', title: '고구마 엔딩', charId: 'goguma', bg: 'bg_pier', overlay: 'sunset' },
  { key: '#### 혼자 돌아가기 엔딩', id: 'ending_alone', title: '혼자 돌아가기 엔딩', charId: null, bg: 'bg_chuncheon_station', overlay: null },
];
for (const ed of singleEndings) {
  const ep = parseSectionLines(getSec(ed.key), { charId: ed.charId, sceneId: ed.id });
  pushScene({
    id: ed.id,
    title: ed.title,
    endingTitle: ep.endingTitle || ed.title,
    type: 'ending',
    day: 3,
    background: ep.background !== 'bg_black' ? ep.background : ed.bg,
    overlay: ep.overlay !== null ? ep.overlay : ed.overlay,
    time: ed.id === 'ending_alone' ? '낮' : '황혼',
    bgm: 'bgm_ending',
    dialogues: ep.dialogues,
    choices: null,
    next: null,
  });
}

// 볶음밥 엔딩 (인트로 + 2지선다 -> 재회 엔딩 / 노멀 엔딩 분리)
{
  const bp = parseSectionLines(getSec('#### 볶음밥 엔딩'), { charId: 'bokkeumbap', sceneId: 'ending_bokkeumbap_intro' });
  const choiceIdx = bp.dialogues.findIndex(d => d.type === 'choice');
  const introDialogues = bp.dialogues.slice(0, choiceIdx);
  const choiceBlock = bp.dialogues[choiceIdx];
  const optReunion = choiceBlock.options[0];
  const optNormal = choiceBlock.options[1];

  pushScene({
    id: 'ending_bokkeumbap_intro',
    title: '볶음밥 엔딩 — 대화',
    type: 'normal',
    day: 3,
    background: 'bg_pier',
    overlay: 'sunset',
    time: '황혼',
    bgm: 'bgm_ending',
    dialogues: introDialogues,
    choices: {
      id: 'bokkeumbap_final',
      question: '',
      options: [
        { key: 'A', text: optReunion.text, next: 'ending_bokkeumbap_reunion', effects: null, followUp: [] },
        { key: 'B', text: optNormal.text, next: 'ending_bokkeumbap_normal', effects: null, followUp: [] },
      ],
    },
    next: null,
  });

  pushScene({
    id: 'ending_bokkeumbap_reunion',
    title: '볶음밥 재회 엔딩',
    endingTitle: optReunion.endingTitle || '다시, 우리라는 이름으로.',
    type: 'ending',
    day: 3,
    background: 'bg_pier',
    overlay: 'sunset',
    time: '황혼',
    bgm: 'bgm_ending',
    dialogues: optReunion.followUp,
    choices: null,
    next: null,
  });

  pushScene({
    id: 'ending_bokkeumbap_normal',
    title: '볶음밥 노멀 엔딩',
    endingTitle: optNormal.endingTitle || '각자의 속도로',
    type: 'ending',
    day: 3,
    background: 'bg_pier',
    overlay: 'sunset',
    time: '황혼',
    bgm: 'bgm_ending',
    dialogues: optNormal.followUp,
    choices: null,
    next: null,
  });
}

// ── 기존 data/scenes/*.json 전부 삭제 후 새 씬 저장 ──
const scenesDir = path.join(rootDir, 'data', 'scenes');
fs.mkdirSync(scenesDir, { recursive: true });
for (const f of fs.readdirSync(scenesDir)) {
  if (f.endsWith('.json')) fs.unlinkSync(path.join(scenesDir, f));
}

const sceneFiles = [];
for (const sc of allScenes) {
  const fname = `${sc.id}.json`;
  fs.writeFileSync(path.join(scenesDir, fname), JSON.stringify(sc, null, 2), 'utf8');
  sceneFiles.push(fname);
}

// ── config 파일 생성 ──
const configDir = path.join(rootDir, 'config');
const dataConfigDir = path.join(rootDir, 'data', 'config');
fs.mkdirSync(configDir, { recursive: true });
fs.mkdirSync(dataConfigDir, { recursive: true });

const charactersData = {
  female: {
    dakgalbi: { id: 'dakgalbi', name: '다곡희', role: '닭갈비', gender: 'female', color: '#FFA94D' },
    yangnyeom: { id: 'yangnyeom', name: '양연미', role: '양념', gender: 'female', color: '#FF6B6B' },
    goguma: { id: 'goguma', name: '고규미', role: '고구마', gender: 'female', color: '#B197FC' },
    bokkeumbap: { id: 'bokkeumbap', name: '박복은', role: '볶음밥', gender: 'female', color: '#FFE066', isHidden: true },
  },
  male: {
    dakgalbi: { id: 'dakgalbi', name: '다고길', role: '닭갈비', gender: 'male', color: '#FFA94D' },
    yangnyeom: { id: 'yangnyeom', name: '양연우', role: '양념', gender: 'male', color: '#FF6B6B' },
    goguma: { id: 'goguma', name: '고구민', role: '고구마', gender: 'male', color: '#B197FC' },
    bokkeumbap: { id: 'bokkeumbap', name: '박복검', role: '볶음밥', gender: 'male', color: '#FFE066', isHidden: true },
  },
};

const scoreScale = { '+2': 2, '+1': 1, '0': 0 };

const gameConfig = {
  title: '오이데 (춘천에서 5명의 이상한 데이트)',
  version: '2.0.0',
  storyVersion: STORY_VERSION,
  PHONE_ASPECT_WIDTH: 9,
  PHONE_ASPECT_HEIGHT: 19.5,
  SHOW_CHOICE_IMAGES: false,
  TRANSITION_MODE: 'cut',
  textSpeed: 40,
  autoSpeed: 2000,
  skipSpeed: 25,
  bgmVolume: 0.5,
  sfxVolume: 0.7,
  showAffinity: true,
  SHOW_HUD: false,
  SHOW_LIKE_FEEDBACK: true,
  dayTransition: {
    fadeOutMs: 1500,
    holdMs: 3500,
    fadeInMs: 1500,
  },
  LIKE_THRESHOLD: 8,
  endingThresholds: {
    dakgalbi: 8,
    yangnyeom: 8,
    goguma: 8,
  },
  saveSlots: 3,
  debugKey: 'KeyD',
  sceneFiles,
};

for (const dir of [configDir, dataConfigDir]) {
  fs.writeFileSync(path.join(dir, 'characters.json'), JSON.stringify(charactersData, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'score_scale.json'), JSON.stringify(scoreScale, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'game_config.json'), JSON.stringify(gameConfig, null, 2), 'utf8');
}

// ── 리포트 생성 ──
const reportMd = `# 오이데 새 스토리 변환 리포트 (${STORY_VERSION})

기준 문서: \`미연시_전체스토리_구현명세.md\`
생성된 총 장면 수: ${allScenes.length}개

## 생성된 장면 목록
${allScenes.map(s => `- \`${s.id}\`: ${s.title} (type=${s.type}, 대사/선택 ${s.dialogues ? s.dialogues.length : 0}개)`).join('\n')}
`;
fs.writeFileSync(path.join(rootDir, 'data', '_import_report.md'), reportMd, 'utf8');

console.log(`[import_story] 새 스토리 변환 완료! 총 ${allScenes.length}개 장면 생성 (${STORY_VERSION}).`);
