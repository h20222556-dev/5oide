#!/usr/bin/env node
/**
 * tools/new-qr-code.mjs — 중복 및 단순 패턴을 피한 새 QR 숫자 코드 생성 도구
 * 사용법: npm run qr:newcode
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONFIG_PATH = path.join(ROOT, 'config', 'qr_config.json');
const DATA_PATH = path.join(ROOT, 'data', 'qr_codes.json');

function isWeakPattern(code) {
  // 1. 모두 같은 숫자 (000000, 111111, ...)
  if (/^(\d)\1+$/.test(code)) return true;

  // 2. 같은 숫자가 4회 이상 연속 (111123 등)
  if (/(\d)\1{3,}/.test(code)) return true;

  // 3. 오름차순 / 내림차순 연속 숫자 (123456, 654321 등)
  let asc = true;
  let desc = true;
  for (let i = 1; i < code.length; i++) {
    const diff = Number(code[i]) - Number(code[i - 1]);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  if (asc || desc) return true;

  // 4. 2자리/3자리 단순 반복 (121212, 123123 등)
  if (code.length % 2 === 0) {
    const half = code.slice(0, code.length / 2);
    if (half.repeat(2) === code) return true;
  }
  if (code.length % 3 === 0) {
    const unit = code.slice(0, 2);
    if (unit.repeat(code.length / 2) === code) return true;
  }

  return false;
}

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const entries = fs.existsSync(DATA_PATH)
    ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
    : [];

  const codeLen = Number(config.QR_CODE_LENGTH) || 6;
  const existing = new Set(
    Array.isArray(entries) ? entries.map((e) => String(e.code)) : []
  );

  const maxVal = 10 ** codeLen;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const candidate = String(crypto.randomInt(0, maxVal)).padStart(codeLen, '0');
    if (existing.has(candidate)) continue;
    if (isWeakPattern(candidate)) continue;

    const grouped = candidate.replace(/(\d{3})(?=\d)/g, '$1 ');
    console.log(`추천 숫자 코드: ${candidate} (인쇄 표기: ${grouped})`);
    return;
  }

  console.error('새 코드를 생성하지 못했습니다.');
  process.exit(1);
}

main();
