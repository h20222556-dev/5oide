/**
 * utils.js — 한국어 조사 처리 및 범용 유틸리티
 */

'use strict';

/**
 * 객체 딥 클론
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 요소 표시 / 숨김
 */
function showEl(el) {
  if (el) el.classList.remove('hidden');
}
function hideEl(el) {
  if (el) el.classList.add('hidden');
}

/**
 * 숫자 부호 문자열 (+6, -2 등)
 */
function signedNum(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * JSON 로더
 */
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load: ${path} (status: ${res.status})`);
  return res.json();
}

/**
 * 한글 음절 종성(받침) 존재 여부 판별
 * @param {string} word - 판별할 단어
 * @returns {boolean} 종성이 있으면 true, 없으면 false
 */
function hasJongseong(word) {
  if (!word || typeof word !== 'string') return false;
  // 단어 끝의 특수문자나 괄호, 공백 등을 제거하고 마지막 한글 문자 확인
  const cleaned = word.replace(/[^가-힣a-zA-Z0-9]/g, '');
  if (!cleaned) return false;

  const lastChar = cleaned.charAt(cleaned.length - 1);
  const code = lastChar.charCodeAt(0);

  // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 > 0;
  }
  // 영문이나 숫자인 경우 대략적인 발음 받침 추정 (필요시)
  const codeStr = lastChar.toLowerCase();
  return ['l', 'm', 'n', 'r', '0', '1', '3', '6', '7', '8'].includes(codeStr);
}

/**
 * 조사 쌍 교정기
 * 조사 종류:
 * - 은/는, 이/가, 을/를, 과/와, 이에요/예요, 이라고/라고, 이랑/랑, 아/야, 으로/로 (ㄹ 받침 예외 포함)
 */
function pickJosa(word, josaPair) {
  const hasJong = hasJongseong(word);

  switch (josaPair) {
    case '은는':
    case '은/는':
      return hasJong ? '은' : '는';
    case '이가':
    case '이/가':
      return hasJong ? '이' : '가';
    case '을를':
    case '을/를':
      return hasJong ? '을' : '를';
    case '과와':
    case '과/와':
      return hasJong ? '과' : '와';
    case '이에요예요':
    case '이에요/예요':
    case '에요예요':
      return hasJong ? '이에요' : '예요';
    case '이라고라고':
    case '이라고/라고':
      return hasJong ? '이라고' : '라고';
    case '이랑랑':
    case '이랑/랑':
      return hasJong ? '이랑' : '랑';
    case '아야':
    case '아/야':
      return hasJong ? '아' : '야';
    case '으로로':
    case '으로/로': {
      // 'ㄹ' 종성의 경우 종성이 있어도 '로'를 취함
      if (!hasJong) return '로';
      const lastChar = word.charAt(word.length - 1);
      const code = lastChar.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const jongCode = (code - 0xAC00) % 28;
        if (jongCode === 8) return '로'; // 8번이 'ㄹ'
      }
      return '으로';
    }
    default:
      return '';
  }
}

/**
 * 캐릭터 표시 이름 매핑 (성별에 따른 이름)
 * - 남성 캐릭터 (playerGender / gender === 'male'): 닭갈비=다고길, 양념=양연우, 고구마=고구민, 볶음밥=박복검
 * - 여성 캐릭터 (playerGender / gender === 'female'): 닭갈비=다곡희, 양념=양연미, 고구마=고규미, 볶음밥=박복은
 */
const CHARACTER_DISPLAY_NAMES = {
  female: {
    dakgalbi: '다곡희',
    yangnyeom: '양연미',
    goguma: '고규미',
    bokkeumbap: '박복은',
  },
  male: {
    dakgalbi: '다고길',
    yangnyeom: '양연우',
    goguma: '고구민',
    bokkeumbap: '박복검',
  }
};

/**
 * 캐릭터 ID와 선택한 성별을 기반으로 표시 이름 반환
 * 규칙: 시작 화면에서 고른 성별 = 상대 캐릭터들의 성별
 * - 'male': 다고길, 양연우, 고구민, 박복검
 * - 'female': 다곡희, 양연미, 고규미, 박복은
 * @param {string} characterId - 캐릭터 ID ('dakgalbi', 'goguma' 등) 또는 역할명 ('닭갈비' 등)
 * @param {string} gender - 선택한 성별 ('male' 또는 'female')
 * @returns {string} 사람 이름 (다곡희, 다고길 등)
 */
function getDisplayName(characterId, gender = 'female') {
  if (!characterId) return '';
  const genderKey = (gender === 'male') ? 'male' : 'female';
  const idMap = {
    '닭갈비': 'dakgalbi',
    '닭고기': 'dakgalbi',
    '양념': 'yangnyeom',
    '고구마': 'goguma',
    '볶음밥': 'bokkeumbap',
    'dakgalbi': 'dakgalbi',
    'yangnyeom': 'yangnyeom',
    'goguma': 'goguma',
    'bokkeumbap': 'bokkeumbap'
  };
  const key = idMap[characterId] || characterId;
  return CHARACTER_DISPLAY_NAMES[genderKey]?.[key] || characterId;
}

/**
 * 단어에 적절한 조사를 붙여서 반환
 * @param {string} word - 단어
 * @param {string} josaPair - 조사 쌍 ('은/는', '이/가', '을/를', '과/와', '아/야', '으로/로')
 * @returns {string} 조사가 붙은 단어
 */
function appendJosa(word, josaPair) {
  return word + pickJosa(word, josaPair);
}

/**
 * 텍스트 템플릿 변수 치환 및 조사 자동 교정
 * 
 * 1) 변수 치환:
 *    - {player} -> 플레이어 이름
 *    - {닭갈비} / {name:dakgalbi} -> 성별에 따른 이름 (다곡희/다고길)
 *    - {양념} / {name:yangnyeom} -> 성별에 따른 이름 (양연미/양연우)
 *    - {고구마} / {name:goguma} -> 성별에 따른 이름 (고규미/고구민)
 *    - {볶음밥} / {name:bokkeumbap} -> 성별에 따른 이름 (박복은/박복검)
 * 
 * 2) 명시적 템플릿 조사: {player:은는}, {닭갈비:이가}, {양념:을를}, {고구마:으로로} 등
 * 
 * 3) 원문 자연 텍스트 뒤에 붙은 조사 교정:
 *    - "{player}이라고" -> 받침에 따라 '길이라고' / '희라고'
 *    - "{player}이요" / "{player}이에요" / "{player}예요"
 *    - "{player}은" / "{player}는"
 *    - "{player}이" / "{player}가"
 *    - "{player}을" / "{player}를"
 *    - "{player}과" / "{player}와"
 *    - "{player}으로" / "{player}로"
 * 
 * @param {string} text
 * @param {object} variables - { player, dakgalbi, yangnyeom, goguma, bokkeumbap }
 * @returns {string} 치환 및 조사가 교정된 텍스트
 */
function resolveTextVariables(text, variables = {}) {
  if (!text || typeof text !== 'string') return text;

  const names = {
    player: variables.player || '주인공',
    dakgalbi: variables.dakgalbi || variables['닭갈비'] || '다곡희',
    yangnyeom: variables.yangnyeom || variables['양념'] || '양연미',
    goguma: variables.goguma || variables['고구마'] || '고규미',
    bokkeumbap: variables.bokkeumbap || variables['볶음밥'] || '박복은',
  };

  let result = text;

  // 0) {name:캐릭터ID} 또는 [닭고기]/[고구마]/[양념]/[볶음밥] 대괄호 표기를 표준 플레이스홀더로 정규화
  result = result.replace(/\{name:(dakgalbi|yangnyeom|goguma|bokkeumbap|닭갈비|닭고기|양념|고구마|볶음밥)(?::([가-힣\/]+))?\}/g, (_, cid, josa) => {
    const k = (cid === '닭갈비' || cid === '닭고기' || cid === 'dakgalbi') ? '닭갈비' :
              (cid === '양념' || cid === 'yangnyeom') ? '양념' :
              (cid === '고구마' || cid === 'goguma') ? '고구마' : '볶음밥';
    return josa ? `{${k}:${josa}}` : `{${k}}`;
  });
  result = result.replace(/\[(닭고기|닭갈비|양념|고구마|볶음밥)\]/g, (_, cid) => {
    const k = (cid === '닭고기' || cid === '닭갈비') ? '닭갈비' : cid;
    return `{${k}}`;
  });

  // 1) 템플릿 형태 치환: {변수:조사} 예: {player:은는}, {고구마:으로로}
  result = result.replace(/\{(player|닭갈비|양념|고구마|볶음밥):([가-힣\/]+)\}/g, (_, key, josaPattern) => {
    const k = key === '닭갈비' ? 'dakgalbi' : (key === '양념' ? 'yangnyeom' : (key === '고구마' ? 'goguma' : (key === '볶음밥' ? 'bokkeumbap' : 'player')));
    const name = names[k];
    const josa = pickJosa(name, josaPattern);
    return name + josa;
  });

  // 2) 일반 변수 뒤에 붙은 한국어 조사 교정
  const varKeys = ['player', '닭갈비', '양념', '고구마', '볶음밥'];
  for (const vKey of varKeys) {
    const k = vKey === '닭갈비' ? 'dakgalbi' : (vKey === '양념' ? 'yangnyeom' : (vKey === '고구마' ? 'goguma' : (vKey === '볶음밥' ? 'bokkeumbap' : 'player')));
    const name = names[k];
    const hasJong = hasJongseong(name);

    // {var}이라고 -> {name}(이)라고
    result = result.replace(new RegExp(`\\{${vKey}\\}(이라고|라고)`, 'g'), () => {
      return name + (hasJong ? '이라고' : '라고');
    });

    // {var}이에요/예요 / {var}이요
    result = result.replace(new RegExp(`\\{${vKey}\\}(이에요|예요)`, 'g'), () => {
      return name + (hasJong ? '이에요' : '예요');
    });
    result = result.replace(new RegExp(`\\{${vKey}\\}(이요|요)`, 'g'), () => {
      return name + (hasJong ? '이요' : '요');
    });

    // {var}이랑/랑
    result = result.replace(new RegExp(`\\{${vKey}\\}(이랑|랑)`, 'g'), () => {
      return name + (hasJong ? '이랑' : '랑');
    });

    // {var}이와/와 (예: {닭갈비}이와 -> 다곡희와 / 다고길과)
    result = result.replace(new RegExp(`\\{${vKey}\\}(이와|과|와)`, 'g'), () => {
      return name + (hasJong ? '과' : '와');
    });

    // {var}은/는
    result = result.replace(new RegExp(`\\{${vKey}\\}(은|는)`, 'g'), () => {
      return name + (hasJong ? '은' : '는');
    });

    // {var}이가/이/가 (예: {양념}이가 -> 양연미가, {player}이가 -> 홍길동이)
    result = result.replace(new RegExp(`\\{${vKey}\\}(이가|이|가)`, 'g'), () => {
      return name + (hasJong ? '이' : '가');
    });

    // {var}을/를
    result = result.replace(new RegExp(`\\{${vKey}\\}(을|를)`, 'g'), () => {
      return name + (hasJong ? '을' : '를');
    });

    // {var}으로/로
    result = result.replace(new RegExp(`\\{${vKey}\\}(으로|로)`, 'g'), () => {
      return name + pickJosa(name, '으로/로');
    });

    // {var}아야/아/야
    result = result.replace(new RegExp(`\\{${vKey}\\}(아|야)`, 'g'), () => {
      return name + (hasJong ? '아' : '야');
    });

    // 남은 단순 {var} 치환
    result = result.replace(new RegExp(`\\{${vKey}\\}`, 'g'), name);
  }

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    deepClone,
    showEl,
    hideEl,
    signedNum,
    loadJSON,
    hasJongseong,
    pickJosa,
    appendJosa,
    getDisplayName,
    CHARACTER_DISPLAY_NAMES,
    resolveTextVariables
  };
}

