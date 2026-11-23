/**
 * tools/import_day3.js
 * '남이섬_Day3_스토리.md'(Day 3 남이섬 파트)를 읽어 기존 씬 JSON 포맷의 Day 3 장면 배열을 만든다.
 * tools/import_story.js 가 호출하며(require), 기존 Day 3 장면(s09~s15, ending_*)은 이 결과로 교체된다.
 * md에 없는 대사·분기는 만들지 않는다.
 */
const fs = require('fs');
const path = require('path');

const CHAR_ID = { '닭고기': 'dakgalbi', '양념': 'yangnyeom', '고구마': 'goguma', '볶음밥': 'bokkeumbap' };
const ROLE = { dakgalbi: '닭갈비', yangnyeom: '양념', goguma: '고구마', bokkeumbap: '볶음밥' };
const PH = { dakgalbi: '{닭갈비}', yangnyeom: '{양념}', goguma: '{고구마}', bokkeumbap: '{볶음밥}' };

// md 문구의 이름 표기를 게임 플레이스홀더로 변환 (성별에 따른 이름은 런타임에 치환)
function subNames(t, all) {
  let s = t.replace(/\[주인공\]/g, '{player}').replace(/\[볶음밥\]/g, '{볶음밥}').replace(/닭고기/g, '{닭갈비}');
  if (all) s = s.replace(/양념/g, '{양념}').replace(/고구마/g, '{고구마}').replace(/(?<!\{)볶음밥/g, '{볶음밥}');
  return s;
}

function stripQuotes(raw) {
  let t = (raw || '').trim();
  if (/^["“”]/.test(t)) t = t.slice(1);
  if (/["“”]$/.test(t)) t = t.slice(0, -1);
  return t.trim();
}

function parseTable(lines) {
  const rows = lines.filter(l => l.trim().startsWith('|')).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  return rows.slice(2); // 헤더, 구분선 제외
}

function charDialogue(id, expr, text, type) {
  return {
    speaker: ROLE[id],
    speakerType: type || 'normal',
    text,
    characters: [{ id, position: 'center', expression: expr || '기본', blush: false }],
  };
}

function parseScript(lines) {
  const out = [];
  let pending = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const stage = line.match(/^\*\((.*)\)\*$/);
    if (stage) {
      const st = stage[1];
      if (/프롤로그 오디오 재생/.test(st)) { pending.cue = 'prologue_audio'; continue; }
      if (/이름이 공개된다/.test(st)) { pending.reveal = 'bokkeumbap'; continue; }
      if (/^마지막 컷/.test(st)) { if (out.length) out[out.length - 1].cue = 'prologue_audio_end'; continue; }
      out.push(Object.assign({ speaker: null, speakerType: 'narration', text: subNames(st, true), characters: [] }, pending));
      pending = {};
      continue;
    }
    if (/^\[[^\]:]+\]$/.test(line)) { // [전광판 영상] 같은 라벨
      out.push(Object.assign({ speaker: null, speakerType: 'narration', text: line, characters: [] }, pending));
      pending = {};
      continue;
    }
    const m = line.match(/^(\[[^\]]+\]|[^:(]+?)(?:\(([^)]*)\))?:\s*(.*)$/);
    if (!m) continue;
    let who = m[1].trim();
    const paren = (m[2] || '').trim();
    const text = subNames(stripQuotes(m[3]), false);
    let d;
    if (who === '나레이션') d = { speaker: null, speakerType: 'narration', text, characters: [] };
    else if (who === '자막') d = { speaker: null, speakerType: 'narration', text: `자막: ${text}`, characters: [] };
    else if (who === '주인공') d = { speaker: '주인공', speakerType: paren === 'V.O.' ? 'vo' : (paren === 'O.S.' ? 'os' : 'normal'), text, characters: [] };
    else if (who === '???') d = { speaker: '???', speakerType: paren === 'V.O.' ? 'vo' : 'normal', speakerId: 'bokkeumbap', text, characters: [] };
    else if (who === '[볶음밥]') d = { speaker: '볶음밥', speakerType: 'normal', speakerId: 'bokkeumbap', expression: paren || '기본', text, characters: [] };
    else if (who.startsWith('영상 속 ')) {
      const id = CHAR_ID[who.replace('영상 속 ', '')];
      d = { speaker: `영상 속 ${ROLE[id]}`, speakerType: 'normal', text, characters: [] };
    } else if (CHAR_ID[who]) d = charDialogue(CHAR_ID[who], paren, text);
    else d = { speaker: who, speakerType: 'normal', text, characters: [] };
    Object.assign(d, pending);
    pending = {};
    out.push(d);
  }
  return out;
}

function splitSections(lines) {
  const secs = {};
  let key = null;
  let inCode = false;
  for (const line of lines) {
    const h = line.match(/^#{3,4}\s+(#[0-9A-Za-z\-가-힣]+)/);
    if (h && !inCode) { key = h[1]; secs[key] = { scripts: [], tables: [], bullets: [] }; continue; }
    if (!key) continue;
    const sec = secs[key];
    if (line.trim().startsWith('```')) {
      if (!inCode) { inCode = true; sec.scripts.push([]); } else { inCode = false; }
      continue;
    }
    if (inCode) { sec.scripts[sec.scripts.length - 1].push(line); continue; }
    if (line.trim().startsWith('|')) {
      const last = sec.tables[sec.tables.length - 1];
      if (last && last.open) last.lines.push(line); else sec.tables.push({ open: true, lines: [line] });
      continue;
    }
    if (sec.tables.length) sec.tables[sec.tables.length - 1].open = false;
    sec.bullets.push(line);
  }
  return secs;
}

function generateDay3({ rootDir, report }) {
  const mdPath = fs.existsSync(path.join(rootDir, '남이섬_Day3_스토리.md'))
    ? path.join(rootDir, '남이섬_Day3_스토리.md')
    : '/Users/kakajae/Downloads/남이섬_Day3_스토리.md';
  const lines = fs.readFileSync(mdPath, 'utf8').split(/\r?\n/);
  const S = splitSections(lines);
  const scenes = [];

  const mk = (id, title, bg, time, extra) => Object.assign({
    id, title, type: 'normal', background: bg, time, bgm: 'bgm_main', direction: [], day: 3,
    dialogues: [], choices: null,
  }, extra || {});
  const useBg = (bg) => { if (report && report.requiredImages) report.requiredImages.backgrounds.add(bg); };

  const scoreOptions = (table, next, followUp, cidOf) => table.map((r, i) => {
    const score = parseInt(r[1].replace(/[−–－]/g, '-'), 10);
    const result = r[2] && r[2] !== '—' ? r[2] : null;
    return {
      key: String.fromCharCode(65 + i),
      text: subNames(r[0], true),
      next,
      effectDesc: '',
      effects: { like: { [cidOf]: score }, troubleState: result, targetChar: cidOf },
      followUp: followUp || [],
    };
  });

  // #9
  useBg('bg_pier_morning');
  scenes.push(mk('s09_pier', '#9 선착장 집합', 'bg_pier_morning', '아침', { dialogues: parseScript(S['#9'].scripts[0]), next: 's10_1_video' }));

  // #10-1
  useBg('bg_boat');
  const s101 = S['#10-1'];
  const reactRows = parseTable(s101.tables[0].lines);
  scenes.push(mk('s10_1_video', '#10-1 전광판 영상', 'bg_boat', '낮', {
    dialogues: parseScript(s101.scripts[0]),
    choices: {
      id: 'day3_video_reaction',
      question: '주인공의 반응',
      options: reactRows.map((r, i) => {
        const ids = Object.keys(CHAR_ID).filter(k => r[1].includes(k)).map(k => CHAR_ID[k]).filter(c => c !== 'bokkeumbap');
        return {
          key: String.fromCharCode(65 + i), text: subNames(r[0], true), next: 's10_2_seat', effectDesc: '',
          effects: { likeVisual: ids }, followUp: [],
        };
      }),
    },
  }));

  // #10-2 좌석 선택
  const seatRows = parseTable(S['#10-2'].tables[0].lines);
  const seatIds = { dakgalbi: 's10_3_dakgalbi', yangnyeom: 's10_4_yangnyeom', goguma: 's10_5_goguma' };
  const seatBullets = S['#10-2'].bullets.join('\n');
  const firstM = seatBullets.match(/첫 선택 문구:\s*(.+)/);
  const revisitM = seatBullets.match(/재선택 문구:\s*(.+)/);
  scenes.push(mk('s10_2_seat', '#10-2 좌석 배치', 'bg_boat', '낮', {
    seatPrompts: {
      first: firstM ? firstM[1].trim() : '',
      revisit: revisitM ? revisitM[1].trim() : '',
    },
    choices: {
      id: 'day3_seat', question: '',
      options: seatRows.map((r, i) => {
        const id = CHAR_ID[r[1]];
        return { key: String.fromCharCode(65 + i), charId: id, text: `${r[0]} — ${PH[id]}`, next: seatIds[id], effectDesc: '', effects: null, followUp: [] };
      }),
    },
  }));

  // #10-3 ~ #10-5
  [['#10-3', 'dakgalbi', '갑판 난간 옆 2인석'], ['#10-4', 'yangnyeom', '선내 창가 2인석'], ['#10-5', 'goguma', '선미 쪽 벤치']].forEach(([k, id, place]) => {
    const sec = S[k];
    scenes.push(mk(seatIds[id], `${k} ${place} — ${ROLE[id]}`, 'bg_boat', '낮', {
      dialogues: parseScript(sec.scripts[0]),
      choices: { id: `day3_seat_${id}`, question: '선택하세요', options: scoreOptions(parseTable(sec.tables[0].lines), 's10_2_seat', [], id) },
    }));
  });

  // #11-1
  useBg('bg_namiseom_entrance');
  scenes.push(mk('s11_1_arrive', '#11-1 남이섬 도착', 'bg_namiseom_entrance', '낮', { dialogues: parseScript(S['#11-1'].scripts[0]), next: 's11_2_place' }));

  // #11-2 장소 선택 (엔진이 남은 장소로 대사/선택지를 구성)
  const evId = { '#12-A': 's12_a_dakgalbi', '#12-B': 's12_b_yangnyeom', '#12-C': 's12_c_goguma' };
  const proposals = parseScript(S['#11-2'].scripts[0]);
  const placeRows = parseTable(S['#11-2'].tables[0].lines);
  const placeChars = ['dakgalbi', 'yangnyeom', 'goguma'];
  scenes.push(mk('s11_2_place', '#11-2 장소 선택', 'bg_namiseom_entrance', '낮', {
    type: 'place_select',
    places: placeChars.map((id, i) => ({
      id,
      proposal: proposals[i],
      optionText: subNames(placeRows[i][0], true),
      next: evId[placeRows[i][1]],
    })),
    lastCall: '마지막으로 가볼 곳이 남았네요.',
  }));

  // #12 이벤트
  const evCfg = [
    ['#12-A', 'dakgalbi', 's12_a_dakgalbi', '메타세쿼이아길', 'bg_metasequoia'],
    ['#12-B', 'yangnyeom', 's12_b_yangnyeom', '호숫가 산책로', 'bg_lakeside_path'],
    ['#12-C', 'goguma', 's12_c_goguma', '은행나무길', 'bg_ginkgo_road'],
  ];
  evCfg.forEach(([k, id, sid, spot, bg]) => {
    const sec = S[k];
    useBg(bg);
    const post = parseScript(sec.scripts[1]);
    const extraM = sec.bullets.join('\n').match(/마지막 추가 대사\*\*[^:]*:\s*(닭고기|양념|고구마):\s*"([^"]+)"/);
    const scene = mk(sid, `${k} ${ROLE[id]} / ${spot}`, bg, '낮', {
      dialogues: parseScript(sec.scripts[0]),
      choices: { id: `day3_island_${id}`, question: '선택하세요', options: scoreOptions(parseTable(sec.tables[0].lines), 's11_2_place', post, id) },
    });
    if (extraM) scene.lastExtra = charDialogue(CHAR_ID[extraM[1]], '기본', subNames(extraM[2], false));
    scenes.push(scene);
  });

  // #13 노을
  useBg('bg_sunset_lake');
  const s13 = S['#13'];
  const topLines = {};
  parseScript(s13.scripts[1]).forEach(d => { const id = d.characters[0].id; topLines[id] = d; });
  scenes.push(mk('s13_sunset', '#13 노을', 'bg_sunset_lake', '노을', { dialogues: parseScript(s13.scripts[0]), topLines, next: 's13_2_return' }));
  scenes.push(mk('s13_2_return', '#13-2 귀환 컷', 'bg_sunset_lake', '노을', { dialogues: parseScript(S['#13-2'].scripts[0]), next: 's14_pier_sunset' }));

  // #14 춘천 선착장
  useBg('bg_pier_night');
  scenes.push(mk('s14_pier_sunset', '#14 춘천 선착장 (분기 판정)', 'bg_pier_night', '밤', { type: 'judge' }));
  scenes.push(mk('s14_a_silhouette', '#14-A 조건 미충족', 'bg_pier_night', '밤', { dialogues: parseScript(S['#14-A'].scripts[0]), next: 's15_final_choice' }));
  scenes.push(mk('s14_b_bokkeumbap', '#14-B 조건 충족', 'bg_pier_night', '밤', { dialogues: parseScript(S['#14-B'].scripts[0]), next: 's15_final_choice' }));

  // #15 최종 선택 (엔진이 like / hidden_unlocked 로 버튼 구성)
  scenes.push(mk('s15_final_choice', '#15 최종 선택', 'bg_pier_night', '밤', { type: 'final' }));

  // #16 엔딩
  useBg('bg_sunset_pier');
  scenes.push(mk('ending_bokkeumbap', '#16-재회 (볶음밥)', 'bg_pier_night', '밤', { type: 'ending', dialogues: parseScript(S['#16-재회'].scripts[0]) }));

  const farewell = parseScript(S['#16-개별'].scripts[0]).map(d => Object.assign(d, { onlyIf: 'hidden' }));
  const cgRows = parseTable(S['#16-개별'].tables[0].lines);
  const endBg = { dakgalbi: 'bg_metasequoia', yangnyeom: 'bg_lakeside_path', goguma: 'bg_ginkgo_road' };
  cgRows.forEach(r => {
    const id = CHAR_ID[r[0]];
    scenes.push(mk(`ending_${id}`, `#16-개별 ${ROLE[id]} 엔딩`, endBg[id], '노을', {
      type: 'ending',
      dialogues: farewell.map(d => Object.assign({}, d)).concat([{
        speaker: null, speakerType: 'narration', text: stripQuotes(r[2]), characters: [],
        cg: { id: `cg_ending_${id}`, caption: subNames(r[1], true) },
      }]),
    }));
  });

  const aloneNarr = parseScript(S['#16-혼자'].scripts[0]);
  scenes.push(mk('ending_alone', '#16-혼자 혼자 돌아가기', 'bg_pier_night', '밤', {
    type: 'ending',
    dialogues: [{ speaker: null, speakerType: 'narration', text: '{볶음밥}은 아무 말 없이 서 있고, 주인공이 가볍게 목례하고 지나간다.', characters: [], onlyIf: 'hidden' }].concat(aloneNarr),
  }));

  return scenes;
}

module.exports = { generateDay3 };
