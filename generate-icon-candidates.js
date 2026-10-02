/**
 * Generates 4 modern-minimal candidate icon sets for AiSave.
 * Run: node generate-icon-candidates.js
 * Output: icons/candidates/set-A|B|C|D/icon{16,48,128}.png + preview.html
 * No external deps - pure Node + zlib, supersampled for smooth edges.
 */
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

// ---------- PNG encoding (same approach as generate-icons.js) ----------
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
  const lenB = Buffer.allocUnsafe(4);
  lenB.writeUInt32BE(data.length);
  const crcB = Buffer.allocUnsafe(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([lenB, typeB, data, crcB]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; raw[o++] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- High-res raster helpers (supersampled) ----------
function makeHR(size, ss) {
  const H = size * ss;
  return { H, W: H, ss, size, buf: new Uint8ClampedArray(H * H * 4) };
}
function setPxHR(hr, x, y, color) {
  if (x < 0 || y < 0 || x >= hr.W || y >= hr.H) return;
  const i = (y * hr.W + x) * 4;
  const [r, g, b, a] = color;
  if (a === 255) {
    hr.buf[i] = r; hr.buf[i + 1] = g; hr.buf[i + 2] = b; hr.buf[i + 3] = 255;
  } else if (a === 0) {
    return;
  } else {
    // alpha blend over existing
    const dr = hr.buf[i], dg = hr.buf[i + 1], db = hr.buf[i + 2], da = hr.buf[i + 3];
    const sa = a / 255, daa = da / 255;
    const outA = sa + daa * (1 - sa);
    if (outA < 0.001) return;
    hr.buf[i] = Math.round((r * sa + dr * daa * (1 - sa)) / outA);
    hr.buf[i + 1] = Math.round((g * sa + dg * daa * (1 - sa)) / outA);
    hr.buf[i + 2] = Math.round((b * sa + db * daa * (1 - sa)) / outA);
    hr.buf[i + 3] = Math.round(outA * 255);
  }
}
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  // inside straight region
  if (x >= x0 + r && x < x1 - r) return true;
  if (y >= y0 + r && y < y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function fillRoundedRect(hr, x0, y0, x1, y1, r, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); r = Math.round(r);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (inRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, r)) setPxHR(hr, x, y, color);
}
function fillRect(hr, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPxHR(hr, x, y, color);
}
function fillCircle(hr, cx, cy, r, color) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r * r) setPxHR(hr, x, y, color);
  }
}
function sign(x0, y0, x1, y1, x2, y2) { return (x0 - x2) * (y1 - y2) - (x1 - x2) * (y0 - y2); }
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}
function fillTriangle(hr, ax, ay, bx, by, cx, cy, color) {
  const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx));
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (inTri(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) setPxHR(hr, x, y, color);
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}
function thickLine(hr, ax, ay, bx, by, th, color) {
  const x0 = Math.floor(Math.min(ax, bx) - th), x1 = Math.ceil(Math.max(ax, bx) + th);
  const y0 = Math.floor(Math.min(ay, by) - th), y1 = Math.ceil(Math.max(ay, by) + th);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (distSeg(x + 0.5, y + 0.5, ax, ay, bx, by) <= th / 2) setPxHR(hr, x, y, color);
  }
  fillCircle(hr, ax, ay, th / 2, color);
  fillCircle(hr, bx, by, th / 2, color);
}
function downsample(hr) {
  const { size, ss, W, buf } = hr;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
        const i = (((y * ss + dy) * W + (x * ss + dx)) * 4);
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
      }
      const n = ss * ss, j = (y * size + x) * 4;
      out[j] = Math.round(r / n); out[j + 1] = Math.round(g / n);
      out[j + 2] = Math.round(b / n); out[j + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ---------- Colors ----------
const WHITE = [255, 255, 255, 255];
const INDIGO = [79, 70, 229, 255];
const INDIGO_DARK = [67, 56, 202, 255];
const TEAL = [13, 148, 136, 255];
const TEAL_DARK = [15, 118, 110, 255];
const SLATE = [30, 41, 59, 255];
const AMBER = [251, 191, 36, 255];
const BLUE = [59, 130, 246];
const VIOLET = [139, 92, 246];

// ---------- Sets ----------
function paintBG(hr, H, style) {
  const r = H * 0.22;
  if (style === 'indigo') fillRoundedRect(hr, 0, 0, H, H, r, INDIGO);
  else if (style === 'teal') fillRoundedRect(hr, 0, 0, H, H, r, TEAL);
  else if (style === 'slate') {
    fillRoundedRect(hr, 0, 0, H, H, r, SLATE);
  } else if (style === 'gradient') {
    // per-pixel gradient then mask to rounded rect via second pass? do direct: fill + recolor
    for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
      if (!inRoundedRect(x + 0.5, y + 0.5, 0, 0, H, H, r)) continue;
      const t = (x / H + y / H) / 2;
      setPxHR(hr, x, y, [
        Math.round(BLUE[0] + (VIOLET[0] - BLUE[0]) * t),
        Math.round(BLUE[1] + (VIOLET[1] - BLUE[1]) * t),
        Math.round(BLUE[2] + (VIOLET[2] - BLUE[2]) * t),
        255,
      ]);
    }
  }
}

function drawSetA(hr, H, size) {
  paintBG(hr, H, 'indigo');
  const s = H / 100;
  // document
  const dx0 = 30 * s, dy0 = 20 * s, dx1 = 70 * s, dy1 = 80 * s;
  fillRoundedRect(hr, dx0, dy0, dx1, dy1, 7 * s, WHITE);
  // fold cut (indigo triangle top-right)
  if (size >= 32) fillTriangle(hr, 58 * s, dy0, dx1, 32 * s, 58 * s, 32 * s, [199, 210, 254, 255]);
  // arrow stem + head (indigo)
  const cx = 50 * s;
  const stemW = (size <= 16 ? 13 : 10) * s;
  fillRect(hr, cx - stemW / 2, 38 * s, cx + stemW / 2, 60 * s, INDIGO);
  fillTriangle(hr, 35 * s, 54 * s, 65 * s, 54 * s, cx, 72 * s, INDIGO);
}
function drawSetB(hr, H, size) {
  paintBG(hr, H, 'teal');
  const s = H / 100;
  // bubble
  fillRoundedRect(hr, 20 * s, 22 * s, 80 * s, 66 * s, 10 * s, WHITE);
  fillTriangle(hr, 30 * s, 60 * s, 38 * s, 80 * s, 48 * s, 60 * s, WHITE);
  // text lines (teal)
  const lh = (size <= 16 ? 8 : 6.5) * s;
  fillRoundedRect(hr, 31 * s, 34 * s, 69 * s, 34 * s + lh, 3 * s, TEAL);
  fillRoundedRect(hr, 31 * s, 45 * s, (size <= 16 ? 62 : 58) * s, 45 * s + lh, 3 * s, TEAL);
}
function drawSetC(hr, H, size) {
  paintBG(hr, H, 'slate');
  const s = H / 100;
  const th = (size <= 16 ? 13 : 10.5) * s;
  const yT = 34 * s, yB = 66 * s, midY = 52 * s;
  thickLine(hr, 31 * s, yT, 31 * s, yB, th, WHITE);
  thickLine(hr, 31 * s, yT, 50 * s, midY, th, WHITE);
  thickLine(hr, 50 * s, midY, 69 * s, yT, th, WHITE);
  thickLine(hr, 69 * s, yT, 69 * s, yB, th, WHITE);
  // amber underline accent
  fillRoundedRect(hr, 31 * s, 72 * s, 69 * s, (size <= 16 ? 80 : 78) * s, 2.5 * s, AMBER);
}
function drawSetD(hr, H, size) {
  paintBG(hr, H, 'gradient');
  const s = H / 100;
  const cx = 50 * s;
  const stemW = (size <= 16 ? 14 : 11) * s;
  fillRect(hr, cx - stemW / 2, 26 * s, cx + stemW / 2, 58 * s, WHITE);
  fillTriangle(hr, 30 * s, 50 * s, 70 * s, 50 * s, cx, 70 * s, WHITE);
  // tray
  const ty = 75 * s, th = (size <= 16 ? 8 : 6) * s;
  fillRoundedRect(hr, 27 * s, ty, 73 * s, ty + th, 2.5 * s, WHITE);
  if (size >= 32) {
    fillRect(hr, 27 * s, (ty - 7 * s), 27 * s + 5 * s, ty + th, WHITE);
    fillRect(hr, 73 * s - 5 * s, (ty - 7 * s), 73 * s, ty + th, WHITE);
  }
}

const SETS = {
  'set-A-doc-indigo': { fn: drawSetA, title: 'A — Indigo document + download arrow', bg: '#4F46E5' },
  'set-B-chat-teal': { fn: drawSetB, title: 'B — Teal chat bubble + text lines', bg: '#0D9488' },
  'set-C-markdown-slate': { fn: drawSetC, title: 'C — Slate Markdown M + amber underline', bg: '#1E293B' },
  'set-D-download-gradient': { fn: drawSetD, title: 'D — Blue→violet gradient + download', bg: 'linear-gradient(135deg,#3B82F6,#8B5CF6)' },
};

const outBase = path.join(__dirname, 'icons', 'candidates');
for (const [name, set] of Object.entries(SETS)) {
  const dir = path.join(outBase, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const ss = size <= 16 ? 8 : 4; // extra supersampling for tiny sizes
    const hr = makeHR(size, ss);
    const H = hr.H;
    set.fn(hr, H, size);
    const rgba = downsample(hr);
    fs.writeFileSync(path.join(dir, `icon${size}.png`), encodePNG(size, rgba));
    console.log(`Created ${name}/icon${size}.png`);
  }
}

// preview gallery
const cards = Object.entries(SETS).map(([name, set]) => `
  <div class="card">
    <div class="swatch" style="background:${set.bg}"></div>
    <h2>${set.title}</h2>
    <p><code>${name}/</code></p>
    <div class="row">
      <div><img src="${name}/icon128.png" width="128" height="128" style="image-rendering:auto"><div class="lbl">128</div></div>
      <div><img src="${name}/icon48.png" width="48" height="48"><div class="lbl">48</div></div>
      <div><img src="${name}/icon16.png" width="16" height="16" style="image-rendering:pixelated"><div class="lbl">16 actual</div></div>
      <div><img src="${name}/icon16.png" width="48" height="48" style="image-rendering:pixelated"><div class="lbl">16 @3x zoom</div></div>
    </div>
    <div class="toolbar-demo">
      <span class="tb light"><img src="${name}/icon16.png" width="16" height="16"> light toolbar</span>
      <span class="tb dark"><img src="${name}/icon16.png" width="16" height="16"> dark toolbar</span>
    </div>
  </div>`).join('\n');

fs.writeFileSync(path.join(outBase, 'preview.html'), `<!doctype html><meta charset="utf-8">
<title>AiSave icon candidates</title>
<style>
body{font-family:system-ui,sans-serif;background:#f4f4f5;margin:24px;color:#18181b}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin-bottom:16px;max-width:640px}
.swatch{height:8px;border-radius:4px;margin-bottom:8px}
.row{display:flex;gap:24px;align-items:end;margin:12px 0}
.lbl{font-size:12px;color:#71717a;margin-top:4px}
.toolbar-demo{display:flex;gap:12px;margin-top:8px}
.tb{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border-radius:8px}
.light{background:#fff;border:1px solid #d4d4d8}
.dark{background:#27272a;color:#fff;border:1px solid #3f3f46}
</style>
<h1>AiSave — icon candidates (modern minimal)</h1>
<p>Compare at real toolbar size (16px) and zoomed. Tell me the winner (A/B/C/D) and I'll install it to <code>icons/icon*.png</code>.</p>
${cards}`);
console.log('Created preview.html');
