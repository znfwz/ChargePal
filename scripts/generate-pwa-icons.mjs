import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const iconsDir = path.join(root, 'public', 'icons');
const sourceDir = path.join(iconsDir, 'source');

fs.mkdirSync(sourceDir, { recursive: true });

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="128" y1="128" x2="896" y2="896" gradientUnits="userSpaceOnUse">
      <stop stop-color="#10B981"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="112" y="112" width="800" height="800" rx="224" fill="url(#bg)"/>
  <path d="M560 240L360 532H496L432 784L664 456H528L560 240Z" fill="white"/>
  <rect x="304" y="304" width="416" height="416" rx="120" stroke="white" stroke-opacity="0.18" stroke-width="20"/>
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
