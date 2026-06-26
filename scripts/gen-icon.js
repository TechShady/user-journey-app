// Generate a 64x64 segmented funnel icon as PNG
const fs = require("fs");
const { createCanvas } = require("canvas");

const SIZE = 64;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// Background: transparent
ctx.clearRect(0, 0, SIZE, SIZE);

// Funnel parameters - 4 segments with colors
const segments = [
  { color: "#4C7CF3" },  // Blue
  { color: "#2BBFB3" },  // Teal
  { color: "#5ECC62" },  // Green
  { color: "#F5C542" },  // Gold
];

const topY = 6;
const bottomY = 58;
const segHeight = (bottomY - topY) / segments.length;

const topWidthHalf = 28;  // half-width at the very top
const bottomWidthHalf = 6; // half-width at the very bottom
const centerX = SIZE / 2;
const gap = 1.5; // gap between segments

segments.forEach((seg, i) => {
  const y1 = topY + i * segHeight + (i > 0 ? gap / 2 : 0);
  const y2 = topY + (i + 1) * segHeight - (i < segments.length - 1 ? gap / 2 : 0);

  // Linear interpolation for widths
  const t1 = (y1 - topY) / (bottomY - topY);
  const t2 = (y2 - topY) / (bottomY - topY);
  const w1 = topWidthHalf * (1 - t1) + bottomWidthHalf * t1;
  const w2 = topWidthHalf * (1 - t2) + bottomWidthHalf * t2;

  ctx.beginPath();
  ctx.moveTo(centerX - w1, y1);
  ctx.lineTo(centerX + w1, y1);
  ctx.lineTo(centerX + w2, y2);
  ctx.lineTo(centerX - w2, y2);
  ctx.closePath();

  // Gradient fill per segment
  const grad = ctx.createLinearGradient(0, y1, 0, y2);
  grad.addColorStop(0, seg.color);
  grad.addColorStop(1, seg.color + "CC");
  ctx.fillStyle = grad;
  ctx.fill();
});

// Write PNG
const buf = canvas.toBuffer("image/png");
const outDir = require("path").resolve(__dirname, "..", "assets");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(require("path").join(outDir, "icon.png"), buf);
console.log("Icon written to assets/icon.png");
