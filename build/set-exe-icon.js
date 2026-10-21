/**
 * electron-builder skips rcedit when signAndEditExecutable is false, so the
 * exe keeps the Electron icon and Electron's file version. The NSIS setup
 * file is branded separately. Stamp build/icon.ico and the package version
 * onto the packed exe before the installer is built.
 * @param {import('app-builder-lib').AfterPackContext} context
 */
module.exports = async function setExeIcon(context) {
  if (context.electronPlatformName !== 'win32') return;

  const path = require('path');
  const { spawnSync } = require('child_process');

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const version = toWindowsVersion(context.packager.appInfo.version);
  const rcedit = findRcedit();
  const result = spawnSync(rcedit, [
    exe,
    '--set-icon', ico,
    '--set-file-version', version,
    '--set-product-version', version,
  ], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`rcedit failed (${result.status})`);
  }
};

/**
 * Windows VERSIONINFO needs four numeric parts. 1.0.12 → 1.0.12.0.
 * @param {string} semver
 * @returns {string}
 */
function toWindowsVersion(semver) {
  const parts = String(semver || '0.0.0').split('.').slice(0, 4);
  while (parts.length < 4) parts.push('0');
  return parts.map((part) => String(parseInt(part, 10) || 0)).join('.');
}

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
