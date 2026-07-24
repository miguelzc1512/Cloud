const fs = require('fs');
const path = require('path');

function patchDevElectron() {
  const root = path.join(__dirname, '..');
  const electronAppDir = path.join(root, 'node_modules/electron/dist/Electron.app');
  const plistPath = path.join(electronAppDir, 'Contents/Info.plist');
  const devIcns = path.join(electronAppDir, 'Contents/Resources/electron.icns');
  const localIcns = path.join(root, 'build/icon.icns');

  if (fs.existsSync(plistPath)) {
    let content = fs.readFileSync(plistPath, 'utf8');
    if (content.includes('<string>Electron</string>')) {
      content = content.replace(/<string>Electron<\/string>/g, '<string>AURORA</string>');
      fs.writeFileSync(plistPath, content);
      console.log('✅ Patched Info.plist CFBundleName to AURORA');
    }
  }

  if (fs.existsSync(localIcns) && fs.existsSync(devIcns)) {
    fs.copyFileSync(localIcns, devIcns);
  }
}

patchDevElectron();
