const fs = require('fs');
const f = 'ui/app/pages/UserJourney.tsx';
let buf = fs.readFileSync(f);

// 4-byte UTF-8 emoji double-encoded through Win-1252
// Pattern: F0 9F XX YY -> each byte encoded as Win-1252->UTF8
// F0 -> C3 B0
// 9F -> C2 9F
// For bytes 80-9F in Win-1252, they map to specific characters
// 
// Let me find the actual byte patterns in the file first
const pattern = Buffer.from('c3b0c29f', 'hex'); // F0 9F prefix double-encoded
let idx = 0;
const found = [];
while ((idx = buf.indexOf(pattern, idx)) !== -1) {
  // Get enough bytes to see the full pattern (usually 8-10 bytes for a 4-byte emoji)
  const slice = buf.slice(idx, idx + 12);
  found.push({ pos: idx, hex: slice.toString('hex') });
  idx += 4;
}
console.log(`Found ${found.length} instances of double-encoded emoji (F0 9F...):`);
const groups = {};
for (const f2 of found) {
  const key = f2.hex.substring(0, 16); // first 8 bytes
  if (!groups[key]) groups[key] = { count: 0, example: f2.pos };
  groups[key].count++;
}
for (const [k, v] of Object.entries(groups)) {
  console.log(`  ${k}: ${v.count}x`);
}
