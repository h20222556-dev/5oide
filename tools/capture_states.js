const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const artifactDir = '/Users/kakajae/.gemini/antigravity/brain/66292322-076c-42d5-816c-523bf6acc765';

const originalHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 1. In-game dialogue & choices (mobile 390x844)
let testHtmlGame = originalHtml
  .replace('id="screen-title" class="screen active"', 'id="screen-title" class="screen"')
  .replace('id="screen-game" class="screen"', 'id="screen-game" class="screen active"');

testHtmlGame = testHtmlGame.replace(
  '<div id="choices-container" class="hidden"></div>',
  `<div id="choices-container">
    <div class="choice-question">어디부터 가는 게 좋을까?</div>
    <button class="choice-btn">A: 레고랜드 — 테마파크</button>
    <button class="choice-btn">B: 소양강 스카이워크 — 강 풍경 명소</button>
    <button class="choice-btn">C: 명동 닭갈비 골목 — 대표 먹거리 거리</button>
  </div>`
).replace(
  '<div id="dialogue-text"></div>',
  '<div id="dialogue-text">오랜만에 떠나는 여행이다. 목적지는 춘천. 특별한 이유가 있는 건 아니었다. 그저 며칠 정도는 익숙한 일상에서 벗어나고 싶었다.</div>'
).replace(
  '<div id="speaker-name"></div>',
  '<div id="speaker-name" style="display:inline-block;color:#ff9ecd;">오이윤</div>'
);

fs.writeFileSync('/tmp/test_game.html', testHtmlGame);

const cmd1 = `"${CHROME}" --headless --disable-gpu --user-data-dir=/tmp/c_game --no-first-run --no-default-browser-check --window-size=390,844 --screenshot="${artifactDir}/mobile_game_choices_390x844.png" "file:///tmp/test_game.html"`;
execSync(cmd1);
console.log('Captured game & choices screenshot:', fs.statSync(`${artifactDir}/mobile_game_choices_390x844.png`).size, 'bytes');

// 2. Gender modal with Back button (mobile 390x844)
let testHtmlModal = originalHtml.replace('id="modal-gender" class="modal-overlay hidden"', 'id="modal-gender" class="modal-overlay"');
fs.writeFileSync('/tmp/test_modal.html', testHtmlModal);
const cmd2 = `"${CHROME}" --headless --disable-gpu --user-data-dir=/tmp/c_mod --no-first-run --no-default-browser-check --window-size=390,844 --screenshot="${artifactDir}/mobile_modal_gender_390x844.png" "file:///tmp/test_modal.html"`;
execSync(cmd2);
console.log('Captured modal screenshot:', fs.statSync(`${artifactDir}/mobile_modal_gender_390x844.png`).size, 'bytes');

// 3. Name modal with Back button (mobile 390x844)
let testHtmlName = originalHtml.replace('id="modal-name" class="modal-overlay hidden"', 'id="modal-name" class="modal-overlay"');
fs.writeFileSync('/tmp/test_name.html', testHtmlName);
const cmd3 = `"${CHROME}" --headless --disable-gpu --user-data-dir=/tmp/c_name --no-first-run --no-default-browser-check --window-size=390,844 --screenshot="${artifactDir}/mobile_modal_name_390x844.png" "file:///tmp/test_name.html"`;
execSync(cmd3);
console.log('Captured name modal screenshot:', fs.statSync(`${artifactDir}/mobile_modal_name_390x844.png`).size, 'bytes');
