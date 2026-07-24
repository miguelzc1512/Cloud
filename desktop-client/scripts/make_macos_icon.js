const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function processIcon() {
  const buildDir = path.join(__dirname, '..', 'build');
  const originalPath = path.join(buildDir, 'icon.png');
  const backupPath = path.join(buildDir, 'icon_original.png');

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(originalPath, backupPath);
  }

  const CANVAS_SIZE = 1024;
  const TILE_SIZE = 824;
  const OFFSET = Math.round((CANVAS_SIZE - TILE_SIZE) / 2); // 100
  const RX = 185;

  const maskSvg = Buffer.from(`
    <svg width="${TILE_SIZE}" height="${TILE_SIZE}">
      <rect x="0" y="0" width="${TILE_SIZE}" height="${TILE_SIZE}" rx="${RX}" ry="${RX}" fill="#fff"/>
    </svg>
  `);

  const resizedTile = await sharp(backupPath)
    .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
    .composite([{
      input: maskSvg,
      blend: 'dest-in'
    }])
    .png()
    .toBuffer();

  const shadowSvg = Buffer.from(`
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <rect x="${OFFSET}" y="${OFFSET}" width="${TILE_SIZE}" height="${TILE_SIZE}" rx="${RX}" ry="${RX}" fill="#000" filter="url(#shadow)"/>
    </svg>
  `);

  const shadowBuffer = await sharp(shadowSvg).png().toBuffer();

  await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    { input: shadowBuffer, top: 0, left: 0 },
    { input: resizedTile, top: OFFSET, left: OFFSET }
  ])
  .png()
  .toFile(originalPath);

  console.log('✅ Icon processed into macOS Squircle standard format successfully!');
}

processIcon().catch(console.error);
