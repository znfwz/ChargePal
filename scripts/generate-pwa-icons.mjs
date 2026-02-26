import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const iconsDir = path.join(root, 'public', 'icons');
const sourceDir = path.join(iconsDir, 'source');

fs.mkdirSync(sourceDir, { recursive: true });

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>
  
  <rect width="512" height="512" rx="112" ry="112" fill="url(#emeraldGradient)" />
  
  <!-- 将线条宽度 stroke-width 从 32 提升到了 48 -->
  <g transform="translate(64, 64) scale(0.75)" stroke="#ffffff" stroke-width="48" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line x1="208" y1="128" x2="208" y2="176" />
    <line x1="304" y1="128" x2="304" y2="176" />
    <rect x="160" y="176" width="192" height="152" rx="40" />
    <line x1="256" y1="328" x2="256" y2="400" />
  </g>
</svg>`;

const sourceSvgPath = path.join(sourceDir, 'icon.svg');
fs.writeFileSync(sourceSvgPath, svg, 'utf8');

const sizes = [
  ['icon-16x16.png', 16],
  ['icon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192x192.png', 192],
  ['icon-512x512.png', 512],
  ['icon-maskable-512x512.png', 512],
];

for (const [filename, size] of sizes) {
  let image = sharp(Buffer.from(svg)).resize(size, size);
  if (filename.includes('maskable')) {
    image = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: '#10B981',
      },
    }).composite([
      {
        input: await sharp(Buffer.from(svg)).resize(Math.round(size * 0.84), Math.round(size * 0.84)).png().toBuffer(),
        gravity: 'center',
      },
    ]);
  }
  await image.png({ compressionLevel: 9 }).toFile(path.join(iconsDir, filename));
}

console.log('Generated PWA icons at public/icons');
