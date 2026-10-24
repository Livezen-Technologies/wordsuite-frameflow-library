// Rebuilds src/i18n/en.json from the message keys used in src/ (t('…'), tn('…', '…', n), tr('…', …), msg('…'))
// and reports keys missing from (or no longer used in) si.json and ta.json. Exit code 1 when a translation is missing.
//   node scripts/i18n-extract.mjs          # write en.json, report
//   node scripts/i18n-extract.mjs --check  # report only (CI)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'test') walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
})(root);

const str = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const one = new RegExp(String.raw`\b(?:t|tr|msg)\(\s*(?:${str})`, 'g');
const two = new RegExp(String.raw`\btn\(\s*(?:${str})\s*,\s*(?:${str})`, 'g');
const unescape = (s) => s.replace(/\\(.)/g, '$1');

const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(one)) keys.add(unescape(m[1] ?? m[2]));
  for (const m of src.matchAll(two)) {
    keys.add(unescape(m[1] ?? m[2]));
    keys.add(unescape(m[3] ?? m[4]));
  }
}
const sorted = [...keys].sort((a, b) => a.localeCompare(b));
const en = Object.fromEntries(sorted.map((k) => [k, k]));
const dir = join(root, 'i18n');
if (!process.argv.includes('--check')) writeFileSync(join(dir, 'en.json'), JSON.stringify(en, null, 2) + '\n');

let bad = false;
for (const lang of ['si', 'ta']) {
  const cat = JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8'));
  const missing = sorted.filter((k) => !cat[k]);
  const unused = Object.keys(cat).filter((k) => !keys.has(k));
  if (missing.length) {
    bad = true;
    console.log(`${lang}: ${missing.length} missing\n` + missing.map((k) => `  ${JSON.stringify(k)}`).join('\n'));
  }
  if (unused.length) console.log(`${lang}: ${unused.length} unused\n` + unused.map((k) => `  ${JSON.stringify(k)}`).join('\n'));
}
console.log(`${sorted.length} keys`);
process.exit(bad ? 1 : 0);
