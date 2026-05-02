const fs = require('fs');
const f = 'ui/app/pages/UserJourney.tsx';
let buf = fs.readFileSync(f);

// Win-1252 byte 80-9F mapping to Unicode codepoints (then UTF-8 encoded)
// 9F -> U+0178 (Ÿ) -> C5 B8
// 94 -> U+201D (") -> E2 80 9D  
// 93 -> U+201C (") -> E2 80 9C
// 92 -> U+2019 (') -> E2 80 99
// 91 -> U+2018 (') -> E2 80 98
// 8C -> U+0152 (Œ) -> C5 92
// 9C -> U+0153 (œ) -> C5 93
// 
// So a 4-byte UTF-8 char F0 XX YY ZZ gets double-encoded as:
// F0 -> C3 B0
// XX -> win1252_to_utf8(XX) 
// YY -> win1252_to_utf8(YY)
// ZZ -> win1252_to_utf8(ZZ)
//
// For emoji starting with F0 9F:
// F0 -> C3 B0
// 9F -> C5 B8 (Win-1252: Ÿ = U+0178)
//
// 🔴 U+1F534 = F0 9F 94 B4: C3B0 + C5B8 + E2809D (94=") + C2B4 (B4 is just C2B4)
// 🟠 U+1F7E0 = F0 9F 9F A0: C3B0 + C5B8 + C5B8 (9F=Ÿ again!) + C2A0 (A0)
// Wait that can't be right... 🟠 has 9F twice?
// Let me check: U+1F7E0 in UTF-8: F0 9F 9F A0. Yes!
// 🟡 U+1F7E1 = F0 9F 9F A1: C3B0 + C5B8 + C5B8 + C2A1
// 🟢 U+1F7E2 = F0 9F 9F A2: C3B0 + C5B8 + C5B8 + C2A2
// 🚀 U+1F680 = F0 9F 9A 80: C3B0 + C5B8 + C5A1(9A=š=U+0161) + E282AC(80=€=U+20AC)

// Build the replacements
const replacements = [
  // 🔴 U+1F534 = F0 9F 94 B4
  ['c3b0c5b8e2809dc2b4', 'f09f94b4', 'red circle emoji'],
  // 🟠 U+1F7E0 = F0 9F 9F A0  
  ['c3b0c5b8c5b8c2a0', 'f09f9fa0', 'orange circle emoji'],
  // 🟡 U+1F7E1 = F0 9F 9F A1
  ['c3b0c5b8c5b8c2a1', 'f09f9fa1', 'yellow circle emoji'],
  // 🟢 U+1F7E2 = F0 9F 9F A2
  ['c3b0c5b8c5b8c2a2', 'f09f9fa2', 'green circle emoji'],
  // 🚀 U+1F680 = F0 9F 9A 80
  ['c3b0c5b8c5a1e282ac', 'f09f9a80', 'rocket emoji'],
];

let total = 0;
for (const [badHex, goodHex, desc] of replacements) {
  const badBuf = Buffer.from(badHex, 'hex');
  const goodBuf = Buffer.from(goodHex, 'hex');
  let count = 0;
  let idx = 0;
  while ((idx = buf.indexOf(badBuf, idx)) !== -1) {
    count++;
    idx += badBuf.length;
  }
  if (count > 0) {
    const parts = [];
    let start = 0;
    idx = 0;
    while ((idx = buf.indexOf(badBuf, start)) !== -1) {
      parts.push(buf.slice(start, idx));
      parts.push(goodBuf);
      start = idx + badBuf.length;
    }
    parts.push(buf.slice(start));
    buf = Buffer.concat(parts);
    console.log(`  ${desc}: replaced ${count}`);
    total += count;
  }
}

fs.writeFileSync(f, buf);
console.log(`\nTotal: fixed ${total} emoji mojibake occurrences`);

// Verify
const check = fs.readFileSync(f, 'utf8');
const remaining = check.match(/ðŸ/g);
if (remaining) {
  console.log(`WARNING: ${remaining.length} potential remaining ðŸ patterns`);
  // Show context
  const idx2 = check.indexOf('\u00f0\u0178');
  if (idx2 >= 0) console.log('Context:', JSON.stringify(check.substring(idx2, idx2+20)));
} else {
  console.log('All emoji fixed!');
}
