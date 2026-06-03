// Finalizes the Playwright demo recording:
//   1. Finds the newest .webm under demo-video/raw/.
//   2. Copies it to demo-video/crm-demo.webm.
//   3. If ffmpeg is available, converts it to demo-video/crm-demo.mp4.
//      Otherwise prints exact instructions to convert it yourself.
//
// Run automatically by `npm run demo:video`, or on its own: node scripts/finalize-demo-video.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'demo-video', 'raw');
const OUT_DIR = path.join(ROOT, 'demo-video');
const WEBM = path.join(OUT_DIR, 'crm-demo.webm');
const MP4 = path.join(OUT_DIR, 'crm-demo.mp4');

function findWebms(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findWebms(full));
    else if (entry.name.endsWith('.webm')) out.push(full);
  }
  return out;
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  return r.status === 0;
}

const webms = findWebms(RAW_DIR)
  .map(f => ({ f, m: fs.statSync(f).mtimeMs }))
  .sort((a, b) => b.m - a.m);

if (webms.length === 0) {
  console.error('❌ No .webm recording found under demo-video/raw/.');
  console.error('   Run the recording first:  npm run demo:record');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.copyFileSync(webms[0].f, WEBM);
console.log(`✅ Saved video: ${path.relative(ROOT, WEBM)}`);

if (hasFfmpeg()) {
  console.log('🎞️  Converting to MP4 with ffmpeg...');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', WEBM, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', MP4],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status === 0) {
    console.log(`✅ Saved MP4: ${path.relative(ROOT, MP4)}`);
  } else {
    console.error('⚠️  ffmpeg conversion failed — the .webm above is still valid.');
  }
} else {
  console.log('\nℹ️  ffmpeg not found, so MP4 was not created. The .webm is ready to use.');
  console.log('   To get an MP4:');
  console.log('     • Windows (winget):  winget install Gyan.FFmpeg');
  console.log('     • or download:        https://www.gyan.dev/ffmpeg/builds/');
  console.log('   Then run:  ffmpeg -i demo-video/crm-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an demo-video/crm-demo.mp4');
  console.log('   (or simply re-run:  npm run demo:finalize )');
}
