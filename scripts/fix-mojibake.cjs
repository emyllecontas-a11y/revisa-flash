// Uso: node fix-mojibake.cjs <arquivo> [--write]
// Repara texto UTF-8 que foi lido como cp1252 e regravado (1 a 3 camadas).
const fs = require('fs');
const [,, file, flag] = process.argv;
if (!file) { console.error('uso: node fix-mojibake.cjs <arquivo> [--write]'); process.exit(2); }

// tabela cp1252 -> byte (0x80-0x9F do cp1252; bytes indefinidos viram controles C1)
const hi = [0x20AC,0x81,0x201A,0x192,0x201E,0x2026,0x2020,0x2021,0x2C6,0x2030,0x160,0x2039,0x152,0x8D,0x17D,0x8F,
            0x90,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x2DC,0x2122,0x161,0x203A,0x153,0x9D,0x17E,0x178];
const toByte = new Map();
for (let i = 0; i < 256; i++) toByte.set(i, i);          // 0x00-0xFF == Latin-1 por padrão
for (let i = 0; i < 32; i++) { toByte.delete(0x80 + i); }  // remove ids 0x80-0x9F como "code point"
const rev = new Map();
for (let i = 0; i < 0x80; i++) rev.set(i, i);
for (let i = 0xA0; i < 0x100; i++) rev.set(i, i);
hi.forEach((cp, i) => rev.set(cp, 0x80 + i));

const dec = new TextDecoder('utf-8', { fatal: true });
const MOJI = /Ã[\u0080-¿ƒ‚‘’‰ŠŒŽ™œž -ÿ]|â€|Ã°Å|ðŸ|Â[ -¿]/;

function unwrap(s) {
  const out = [];
  for (const ch of s) {
    const b = rev.get(ch.codePointAt(0));
    if (b === undefined) return null;   // contém caractere fora do cp1252 => não é mojibake puro
    out.push(b);
  }
  try { return dec.decode(Uint8Array.from(out)); } catch { return null; }
}
function fixLine(line) {
  // desembrulha enquanto o resultado for UTF-8 válido; texto saudável nunca desembrulha
  let cur = line;
  for (let i = 0; i < 4; i++) {
    const n = unwrap(cur);
    if (n === null || n === cur) break;
    cur = n;
  }
  return cur;
}

let raw = fs.readFileSync(file);
const hadBom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let text = raw.toString('utf8').replace(/^﻿/, '');
const hadCrlf = text.includes('\r\n');
text = text.replace(/\r\n/g, '\n');

let changed = 0, bad = 0; const failures = [];
const lines = text.split('\n').map((l, i) => {
  if (!MOJI.test(l)) return l;
  const f = fixLine(l);
  if (MOJI.test(f) || f.includes('�')) { bad++; failures.push([i + 1, l.slice(0, 100)]); return l; }
  changed++; return f;
});
console.log(JSON.stringify({ file, hadBom, hadCrlf, linhasCorrigidas: changed, linhasNaoRecuperadas: bad }));
failures.forEach(([n, l]) => console.log('FALHA linha', n, l));
if (flag === '--write') {
  fs.writeFileSync(file, lines.join('\n'), { encoding: 'utf8' }); // UTF-8 sem BOM, LF
  console.log('gravado (UTF-8 sem BOM, LF)');
} else console.log('dry-run: nada foi gravado');
