/**
 * Generates placeholder PNG icons for the AiSave Chrome extension.
 * Run once: node generate-icons.js
 * Replace icons/icon*.png with real artwork when ready.
 */

'use strict';
const zlib = require('node:zlib');
const fs   = require('node:fs');
const path = require('node:path');

// CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const lenB  = Buffer.allocUnsafe(4);
  lenB.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeB, data]);
  const crcB = Buffer.allocUnsafe(4);
  crcB.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenB, typeB, data, crcB]);
}

// Simple icon: indigo (#4F46E5) background with a white "S" glyph drawn on a grid.
// The glyph is defined on a 16×16 grid and scaled for larger sizes.
const GLYPH_16 = [
  '................',
  '....######......',
  '...#......#.....',
  '..#..............',
  '..#..............',
  '...###..........',
  '.....####.......',
  '.........##.....',
  '..........#.....',
  '..........#.....',
  '...#......#.....',
  '....######......',
  '................',
  '................',
  '................',
  '................',
].map(row => row.split('').map(c => c === '#' ? 1 : 0));

function scaledPixel(grid, x, y, size) {
  const sx = Math.floor(x * 16 / size);
  const sy = Math.floor(y * 16 / size);
  return grid[sy]?.[sx] ?? 0;
}

function createPNG(size) {
  // RGBA pixels: indigo BG, white glyph
  const BG = [79, 70, 229, 255];   // #4F46E5
  const FG = [255, 255, 255, 255]; // white

  // Build raw scanlines (filter byte 0 + RGBA pixels)
  const raw = Buffer.alloc((1 + size * 4) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = scaledPixel(GLYPH_16, x, y, size) ? FG : BG;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

for (const size of [16, 48, 128]) {
  const out = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(out, createPNG(size));
  console.log(`Created ${out}`);
}
