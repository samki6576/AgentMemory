#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LAMBDA_SRC = path.join(ROOT_DIR, 'src', 'lambda');
const BUILD_DIR = path.join(ROOT_DIR, 'infrastructure', 'terraform', 'build');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(BUILD_DIR);

const fns = ['write', 'search', 'sync'];

for (const fn of fns) {
  console.log(`==> Packaging ${fn}`);
  const STAGE_DIR = path.join(BUILD_DIR, fn);
  if (fs.existsSync(STAGE_DIR)) fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  const filesToCopy = ['index.js', 'package.json', 'db.js'];
  for (const file of filesToCopy) {
    const src = path.join(LAMBDA_SRC, fn, file);
    const alt = path.join(LAMBDA_SRC, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(STAGE_DIR, file));
    else if (fs.existsSync(alt)) fs.copyFileSync(alt, path.join(STAGE_DIR, file));
    else console.warn(`  -> Warning: ${file} not found for ${fn}`);
  }

  // Install production dependencies in the staged folder
  try {
    cp.execSync('npm install --omit=dev --silent', { cwd: STAGE_DIR, stdio: 'inherit' });
  } catch (err) {
    console.error('npm install failed for', fn, err.message);
    process.exit(1);
  }

  // Create zip archive. Use platform-native tools: zip (Unix) or PowerShell Compress-Archive (Windows).
  const outZip = path.join(BUILD_DIR, `${fn}.zip`);
  try {
    if (process.platform === 'win32') {
      // Use PowerShell Compress-Archive
      const psCmd = [
        'powershell',
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${STAGE_DIR}/*' -DestinationPath '${outZip}' -Force`
      ];
      cp.execFileSync(psCmd[0], psCmd.slice(1), { stdio: 'inherit' });
    } else {
      cp.execSync(`(cd ${STAGE_DIR} && zip -qr ${outZip} .)`, { stdio: 'inherit', shell: true });
    }
  } catch (err) {
    console.error('Failed to create zip for', fn, err.message);
    process.exit(1);
  }

  console.log(`    -> ${outZip}`);
}

console.log('==> Done. Zips are in', BUILD_DIR);
