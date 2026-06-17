const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  '.git',
  'dist',
  'node_modules',
  'unpackage'
]);

const TEXT_EXTS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.json', '.html', '.css', '.scss', '.less',
  '.md', '.txt', '.yml', '.yaml', '.vue'
]);

const EXTRA_TEXT_BASENAMES = new Set([
  '.editorconfig',
  '.gitattributes',
  'Dockerfile'
]);

const IGNORE_FILES = new Set([
  'scripts/check-mojibake.js'
]);

const SUSPICIOUS_PATTERNS = [
  /\uFFFD/,
  /[閸閺閻鐠缁韫娴婢][\u4e00-\u9fff]{2,}/,
  /[鍙鏂涓闈璁杩][\u4e00-\u9fff]{2,}/,
  /閸欘垰娲栭弨/,
  /閺堫亞娅ヨぐ/,
  /閹碘偓闂団偓/,
  /杩炴帴鏈嶅姟鍣/,
  /涓嶈兘涓虹┖/,
  /闈炴硶璺緞/,
  /璁惧/,
  /鍙洖鏀/,
  /鍨冨溇/,
  /鏅鸿兘/,
  /鐜繚/,
  /绉垎/,
  /鍑忕⒊/,
  /鍟嗗煄/,
  /鏈夊/,
  /鍘ㄤ綑/,
  /鏈櫥褰/,
  /绾哥被/,
  /鐢垫睜/,
  /鍓╄彍/,
  /绾稿肪/,
  /鎵€闇€/,
  /蹇厖/,
  /鍑€鍖/,
  /浠绘剰/,
  /澶氱/,
  /馃/,
  /鉁\?/,
  /鈫\?/,
  /锔\?/,
  /鉂\?/
];

function isSkippedDir(relPath) {
  const normalized = relPath.split(path.sep).join('/');
  const segments = normalized.split('/');
  for (const skip of SKIP_DIRS) {
    if (normalized === skip || normalized.startsWith(`${skip}/`) || segments.includes(skip)) {
      return true;
    }
  }
  return false;
}

function isTextFile(filePath) {
  const base = path.basename(filePath);
  if (EXTRA_TEXT_BASENAMES.has(base)) return true;
  return TEXT_EXTS.has(path.extname(base).toLowerCase());
}

function walk(dir, rel = '') {
  const abs = path.join(dir, rel);
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const nextRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (isSkippedDir(nextRel)) continue;
      out.push(...walk(dir, nextRel));
      continue;
    }

    if (!isTextFile(nextRel)) continue;

    const normalized = nextRel.split(path.sep).join('/');
    if (IGNORE_FILES.has(normalized)) continue;
    out.push(nextRel);
  }

  return out;
}

function findIssues(text) {
  const issues = [];
  for (const re of SUSPICIOUS_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) issues.push(re);
  }
  return issues;
}

function findFirstLine(lines, re) {
  for (let i = 0; i < lines.length; i += 1) {
    re.lastIndex = 0;
    if (re.test(lines[i])) {
      return { lineNumber: i + 1, line: lines[i].trim() };
    }
  }
  return null;
}

function main() {
  const files = walk(ROOT);
  const failures = [];

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let text = '';

    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    const issues = findIssues(text);
    if (!issues.length) continue;

    const lines = text.split(/\r?\n/);
    const matches = issues
      .map((re) => {
        const first = findFirstLine(lines, re);
        return first
          ? { pattern: re.toString(), lineNumber: first.lineNumber, line: first.line }
          : { pattern: re.toString(), lineNumber: null, line: '' };
      })
      .slice(0, 5);

    failures.push({
      rel: rel.split(path.sep).join('/'),
      matches
    });
  }

  if (!failures.length) {
    console.log('No mojibake patterns found.');
    process.exit(0);
  }

  console.error('Potential mojibake detected:');
  for (const item of failures) {
    console.error(`- ${item.rel}`);
    for (const match of item.matches) {
      const location = match.lineNumber ? `:${match.lineNumber}` : '';
      console.error(`  ${location} ${match.pattern}`);
      if (match.line) {
        console.error(`    ${match.line}`);
      }
    }
  }
  process.exit(1);
}

main();
