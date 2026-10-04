/**
 * electron-builder skips rcedit when signAndEditExecutable is false, so the
 * exe keeps the Electron icon. The NSIS setup file is branded separately.
 * Stamp build/icon.ico onto the packed exe before the installer is built.
 * @param {import('app-builder-lib').AfterPackContext} context
 */
module.exports = async function setExeIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const path = require('path');
  const { spawnSync } = require('child_process');

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const rcedit = findRcedit();
  const result = spawnSync(rcedit, [exe, '--set-icon', ico], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`rcedit --set-icon failed (${result.status})`);
  }
};

/** Newest rcedit-x64.exe from the electron-builder winCodeSign cache. */
function findRcedit() {
  const path = require('path');
  const fs = require('fs');
  const root = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  const hits = [];
  if (fs.existsSync(root)) {
    for (const dir of fs.readdirSync(root)) {
      const candidate = path.join(root, dir, 'rcedit-x64.exe');
      if (fs.existsSync(candidate)) hits.push(candidate);
    }
  }
  hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!hits.length) {
    throw new Error('rcedit-x64.exe not found in the electron-builder winCodeSign cache');
  }
  return hits[0];
}
