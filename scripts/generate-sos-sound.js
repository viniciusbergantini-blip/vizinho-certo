// Reproducible original notification cue: three two-tone pulses with soft edges.
const fs = require('node:fs');
const path = require('node:path');
const rate = 44100;
const seconds = 2.15;
const frames = Math.round(rate * seconds);
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  const cycle = t % 0.7;
  let sample = 0;
  const start = cycle < 0.23 ? 0 : cycle >= 0.29 && cycle < 0.52 ? 0.29 : null;
  if (t < 2.1 && start !== null) {
    const p = cycle - start;
    const envelope = Math.min(1, p / 0.02, (0.23 - p) / 0.025);
    const hz = start === 0 ? 740 : 1040;
    sample = 0.36 * envelope * Math.sin(2 * Math.PI * hz * p);
  }
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
const output = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'raw', 'sos_alert.wav');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
console.log(`SOS cue: ${seconds}s PCM mono, ${wav.length} bytes.`);
