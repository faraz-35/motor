// Generates the app's PNG assets with a minimal hand-rolled PNG encoder
// (RGBA, zlib via node:crypto — no image deps): a water-drop glyph used for
// the launcher icon, adaptive layers, and the alpha-only status-bar icon.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePng = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.from([0]), rgba.subarray(y * w * 4, (y + 1) * w * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// signed-distance-ish coverage for a water drop: circle + tapered triangle on top
const dropCoverage = (px, py, size) => {
  const x = px / size - 0.5;
  const y = py / size - 0.5;              // 0 top .. 1 bottom
  const cy = 0.16, r = 0.27;              // bulb circle
  const inCircle = (x * x + (y - cy) * (y - cy)) <= r * r;
  const tipY = -0.46;
  const inStem = y > tipY && y < cy && Math.abs(x) <= (r * (y - tipY)) / (cy - tipY) * 0.92;
  if (inCircle || inStem) {
    const edge = inCircle ? r - Math.sqrt(x * x + (y - cy) * (y - cy)) : Math.abs(x);
    return Math.min(1, edge * size * 0.25 + 0.5); // soften ~2px
  }
  return 0;
};

const ACCENT = [34, 211, 238];  // cyan-400, matches app theme
const DARK = [10, 12, 16];      // zinc-950

const make = (size, mode) => {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const a = dropCoverage(px, py, size);
      const i = (py * size + px) * 4;
      if (mode === 'alpha') {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(a * 255);
      } else if (mode === 'fg') {
        rgba[i] = ACCENT[0]; rgba[i + 1] = ACCENT[1]; rgba[i + 2] = ACCENT[2];
        rgba[i + 3] = Math.round(a * 255);
      } else {
        rgba[i] = DARK[0]; rgba[i + 1] = DARK[1]; rgba[i + 2] = DARK[2]; rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(size, size, rgba);
};

const out = (p, buf) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf); console.log(p); };
out('app/assets/icon.png', make(1024, 'bg'));
out('app/assets/android-icon-foreground.png', make(1024, 'fg'));
out('app/assets/android-icon-background.png', make(1024, 'bg'));
out('app/assets/android-icon-monochrome.png', make(1024, 'fg'));
out('packages/motor-alarms/android/src/main/res/drawable/ic_motor_stat.png', make(96, 'alpha'));
