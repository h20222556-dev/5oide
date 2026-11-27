#!/usr/bin/env node
/**
 * tools/make-qr-cards.mjs — 인쇄용 QR 카드 생성 및 자동 디코딩 검증 도구 (개발 전용)
 * 사용법: npm run qr:cards
 *
 * 기능:
 * 1. config/qr_config.json, data/qr_codes.json 읽기 및 중복/형식 검증
 * 2. 각 항목의 QR 코드 PNG 생성 (오류 정정 M, 여백 4모듈, 흰 배경 검은 점)
 * 3. 생성된 QR 이미지를 jsQR로 자동 디코딩하여 QR_PREFIX + code 일치 여부 검증 (실패 시 즉시 종료)
 * 4. 개별 인쇄용 카드 SVG(qr-output/card_{id}.svg) 및 A4 인쇄 시트(qr-output/index.html) 생성
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONFIG_PATH = path.join(ROOT, 'config', 'qr_config.json');
const DATA_PATH = path.join(ROOT, 'data', 'qr_codes.json');
const OUT_DIR = path.join(ROOT, 'qr-output');

/**
 * PNG 바이너리(RGB/RGBA/Grayscale, 8-bit, non-interlaced)를 RGBA Uint8ClampedArray로 디코딩합니다.
 * qrcode 패키지가 출력하는 표준 PNG 버퍼를 외부 이미지 라이브러리 없이 검증하기 위해 사용합니다.
 */
function decodePngToRgba(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) {
    throw new Error('유효한 PNG 시그니처가 아닙니다.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  const idatChunks = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`지원하지 않는 PNG 비트 깊이: ${bitDepth}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!bpp) throw new Error(`지원하지 않는 PNG 컬러 타입: ${colorType}`);

  const stride = width * bpp;
  const recon = Buffer.alloc(height * stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let inPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[inPos++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[inPos++];
      const left = x >= bpp ? recon[rowStart + x - bpp] : 0;
      const up = y > 0 ? recon[rowStart - stride + x] : 0;
      const upLeft = (y > 0 && x >= bpp) ? recon[rowStart - stride + x - bpp] : 0;

      let out = val;
      if (filter === 1) out = (val + left) & 0xff;
      else if (filter === 2) out = (val + up) & 0xff;
      else if (filter === 3) out = (val + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) out = (val + paeth(left, up, upLeft)) & 0xff;
      recon[rowStart + x] = out;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = y * stride + x * bpp;
      if (colorType === 6) {
        rgba[dst] = recon[src];
        rgba[dst + 1] = recon[src + 1];
        rgba[dst + 2] = recon[src + 2];
        rgba[dst + 3] = recon[src + 3];
      } else if (colorType === 2) {
        rgba[dst] = recon[src];
        rgba[dst + 1] = recon[src + 1];
        rgba[dst + 2] = recon[src + 2];
        rgba[dst + 3] = 255;
      } else if (colorType === 0) {
        const g = recon[src];
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
      } else if (colorType === 4) {
        const g = recon[src];
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = recon[src + 1];
      } else if (colorType === 3 && palette) {
        const idx = recon[src] * 3;
        rgba[dst] = palette[idx];
        rgba[dst + 1] = palette[idx + 1];
        rgba[dst + 2] = palette[idx + 2];
        rgba[dst + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCodeDisplay(code) {
  const s = String(code);
  return s.replace(/(\d{3})(?=\d)/g, '$1 ');
}

export async function generateQrCards({ configPath = CONFIG_PATH, dataPath = DATA_PATH, outDir = OUT_DIR } = {}) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const entries = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const codeLen = Number(config.QR_CODE_LENGTH) || 6;
  const prefix = String(config.QR_PREFIX || 'CCDATE:');

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('data/qr_codes.json에 유효한 코드 항목이 없습니다.');
  }

  const seenIds = new Set();
  const seenCodes = new Set();
  const codeRegex = new RegExp(`^\\d{${codeLen}}$`);

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    if (!item || typeof item !== 'object') {
      throw new Error(`${i + 1}번째 항목이 올바른 객체가 아닙니다.`);
    }
    if (!item.id || typeof item.id !== 'string' || !/^[a-z0-9_-]+$/.test(item.id)) {
      throw new Error(`${i + 1}번째 항목의 id("${item.id}")가 소문자 영문/숫자/밑줄 형식이 아닙니다.`);
    }
    if (seenIds.has(item.id)) {
      throw new Error(`중복된 id가 발견되었습니다: "${item.id}"`);
    }
    seenIds.add(item.id);

    if (typeof item.code !== 'string' || !codeRegex.test(item.code)) {
      throw new Error(`항목 "${item.id}"의 code("${item.code}")는 정확히 ${codeLen}자리 숫자 문자열이어야 합니다.`);
    }
    if (seenCodes.has(item.code)) {
      throw new Error(`중복된 숫자 코드가 발견되었습니다: "${item.code}" (id: "${item.id}")`);
    }
    seenCodes.add(item.code);

    if (!item.title || !item.message) {
      throw new Error(`항목 "${item.id}"에 title 또는 message가 누락되었습니다.`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  const generated = [];

  for (const item of entries) {
    const payload = `${prefix}${item.code}`;
    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 320,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    // 생성 직후 jsQR로 자동 디코딩 검증
    const { width, height, rgba } = decodePngToRgba(pngBuffer);
    const decoded = jsQR(rgba, width, height);
    if (!decoded || decoded.data !== payload) {
      throw new Error(
        `QR 자동 디코딩 검증 실패 (${item.id}): 기대값="${payload}", 실제값="${decoded ? decoded.data : 'null'}"`
      );
    }

    const pngName = `qr_${item.id}.png`;
    fs.writeFileSync(path.join(outDir, pngName), pngBuffer);

    const pngDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    const displayCode = formatCodeDisplay(item.code);

    // 개별 인쇄용 카드 SVG (흰 배경 + 검은 QR + 큰 고정폭 숫자 코드 + 작은 제목)
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="470" viewBox="0 0 360 470">
  <rect x="0" y="0" width="360" height="470" rx="18" fill="#FFFFFF" stroke="#E6D5DF" stroke-width="2"/>
  <image href="${pngDataUri}" x="30" y="24" width="300" height="300" image-rendering="pixelated"/>
  <line x1="36" y1="342" x2="324" y2="342" stroke="#F0E4EC" stroke-width="1.5"/>
  <text x="180" y="392" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="38" font-weight="700" letter-spacing="4" fill="#1F1A22">${escapeXml(displayCode)}</text>
  <text x="180" y="434" text-anchor="middle" font-family="'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" font-size="15" font-weight="500" fill="#5A4A56">${escapeXml(item.title)}</text>
</svg>
`;
    const svgName = `card_${item.id}.svg`;
    fs.writeFileSync(path.join(outDir, svgName), svgContent, 'utf8');

    generated.push({
      id: item.id,
      code: item.code,
      displayCode,
      title: item.title,
      payload,
      pngName,
      svgName,
      pngDataUri,
    });
  }

  // A4 세로 인쇄용 통합 HTML (한 페이지 6장 배치)
  const cardsHtml = generated.map((g) => `
    <article class="qr-card">
      <div class="qr-img-wrap">
        <img src="${g.pngDataUri}" alt="${escapeXml(g.title)} QR 코드" />
      </div>
      <div class="qr-code-num">${escapeXml(g.displayCode)}</div>
      <div class="qr-card-title">${escapeXml(g.title)}</div>
    </article>
  `).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>오이데 QR 카드 인쇄 시트</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;
      background: #F6F4F7;
      color: #1F1A22;
      padding: 20px;
    }
    .toolbar {
      max-width: 186mm;
      margin: 0 auto 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #FFFDFB;
      border: 1.5px solid #F4A9C4;
      border-radius: 12px;
    }
    .toolbar h1 { font-size: 16px; color: #70435F; }
    .toolbar p { font-size: 12.5px; color: #6B6178; margin-top: 2px; }
    .print-btn {
      padding: 10px 18px;
      border: none;
      border-radius: 10px;
      background: #F4A9C4;
      color: #4A253D;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    .sheet {
      max-width: 186mm;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8mm;
    }
    .qr-card {
      background: #FFFFFF;
      border: 1px dashed #B8A9B4;
      border-radius: 10px;
      padding: 7mm 6mm 6mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .qr-img-wrap {
      width: 52mm;
      height: 52mm;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FFFFFF;
    }
    .qr-img-wrap img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      display: block;
    }
    .qr-code-num {
      margin-top: 4mm;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #111111;
    }
    .qr-card-title {
      margin-top: 2mm;
      font-size: 10pt;
      color: #5A4A56;
      word-break: keep-all;
    }
    @media print {
      body { background: #FFFFFF; padding: 0; }
      .toolbar { display: none !important; }
      .sheet { max-width: none; gap: 6mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>오이데 인쇄용 QR 카드 (총 ${generated.length}장)</h1>
      <p>A4 세로 기준 페이지당 6장 배치 · 모든 QR 코드는 생성 시 자동 디코딩 검증을 통과했습니다.</p>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">인쇄하기 (A4)</button>
  </div>
  <main class="sheet">
    ${cardsHtml}
  </main>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml, 'utf8');
  return generated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  generateQrCards()
    .then((items) => {
      console.log(`[qr:cards] 총 ${items.length}개의 QR 카드 생성 및 자동 디코딩 검증 완료:`);
      items.forEach((it) => {
        console.log(`  - ${it.id} | ${it.payload} (${it.displayCode}) -> qr-output/${it.svgName}`);
      });
      console.log('  - 인쇄 시트: qr-output/index.html');
    })
    .catch((err) => {
      console.error(`[qr:cards] 오류: ${err.message}`);
      process.exit(1);
    });
}
