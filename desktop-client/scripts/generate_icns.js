const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function createIcns() {
  const iconPng = path.join(__dirname, '..', 'build', 'icon.png');
  const iconsetDir = path.join(__dirname, '..', 'build', 'icon.iconset');
  const icnsPath = path.join(__dirname, '..', 'build', 'icon.icns');

  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  const sizes = [16, 32, 64, 128, 256, 512];
  for (const size of sizes) {
    await sharp(iconPng)
      .resize(size, size)
      .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));
    await sharp(iconPng)
      .resize(size * 2, size * 2)
      .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
  }

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
    console.log('✅ Generated icon.icns successfully!');

    const devIcns = path.join(__dirname, '..', 'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns');
    if (fs.existsSync(devIcns)) {
      fs.copyFileSync(icnsPath, devIcns);
      console.log('✅ Replaced dev Electron.app electron.icns');
    }

    fs.rmSync(iconsetDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Error generating ICNS:', err.message);
  }
}

createIcns();
