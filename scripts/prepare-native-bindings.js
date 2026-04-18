#!/usr/bin/env node
/**
 * 打包前自动补装 build/openclaw 里缺失的 native binding 包
 * 目前处理: @snazzah/davey
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const OPENCLAW_DIR = join(__dirname, '../build/openclaw');

// 需要确保存在的 native binding 包，按目标平台分组
const REQUIRED_BINDINGS = {
  'darwin-arm64': ['@snazzah/davey-darwin-arm64'],
  'darwin-x64':   ['@snazzah/davey-darwin-x64'],
  'win32-x64':    ['@snazzah/davey-win32-x64-msvc'],
};

function getInstalledVersion(pkg) {
  const pkgJson = join(OPENCLAW_DIR, 'node_modules', pkg, 'package.json');
  if (!existsSync(pkgJson)) return null;
  return require(pkgJson).version;
}

function getRequiredVersion(pkg) {
  const daveyPkgJson = join(OPENCLAW_DIR, 'node_modules/@snazzah/davey/package.json');
  const davey = require(daveyPkgJson);
  return (davey.optionalDependencies || {})[pkg] || null;
}

function install(packages) {
  const args = packages.join(' ');
  console.log(`Installing: ${args}`);
  execSync(`npm install ${args} --no-save --force`, {
    cwd: OPENCLAW_DIR,
    stdio: 'inherit',
  });
}

function main() {
  if (!existsSync(OPENCLAW_DIR)) {
    console.error(`build/openclaw not found at ${OPENCLAW_DIR}`);
    process.exit(1);
  }

  const missing = [];

  for (const [platform, pkgs] of Object.entries(REQUIRED_BINDINGS)) {
    for (const pkg of pkgs) {
      const required = getRequiredVersion(pkg);
      const installed = getInstalledVersion(pkg);
      if (!installed) {
        console.log(`[${platform}] Missing: ${pkg}@${required}`);
        missing.push(required ? `${pkg}@${required}` : pkg);
      } else {
        console.log(`[${platform}] OK: ${pkg}@${installed}`);
      }
    }
  }

  if (missing.length === 0) {
    console.log('All native bindings present.');
    return;
  }

  install(missing);
  console.log('Done.');
}

main();
