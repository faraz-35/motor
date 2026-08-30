// Synthesizes res/raw/motor_alarm.wav: a piercing 4-second alarm pattern
// (three fast beeps + pause) in pure stereo 16-bit PCM — no audio deps.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SR = 44100;
const SECONDS = 4;
const samples = SR * SECONDS;
const data = Buffer.alloc(samples * 2 * 2); // stereo, 16-bit

// envelope: beep 260ms / gap 140ms, three per group, 900ms group pause
const beep = (t) => {
  const inGroup = t % 1200;
  const groupPos = t % 2600;
  const active = inGroup < 260 && groupPos < 1200;
  if (!active) return 0;
  // 988 Hz (B5) with slight decay so it cuts through without clipping harshly
  const phase = (2 * Math.PI * 988 * t) / 1000;
  return Math.sin(phase) * Math.exp(-2.2 * (inGroup / 1000)) * 0.92;
};

for (let i = 0; i < samples; i++) {
  const t = (i / SR) * 1000;
  const v = Math.max(-1, Math.min(1, beep(t)));
  const s = Math.round(v * 32767);
  data.writeInt16LE(s, i * 4);
  data.writeInt16LE(s, i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);        // PCM
header.writeUInt16LE(2, 22);        // stereo
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);   // byte rate
header.writeUInt16LE(4, 32);        // block align
header.writeUInt16LE(16, 34);       // bits
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = 'packages/motor-alarms/android/src/main/res/raw/motor_alarm.wav';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`${out} (${((44 + data.length) / 1024).toFixed(0)} KB)`);
