import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { protocolSmoke } from './protocol-smoke.mjs';
const folder = mkdtempSync(path.join(tmpdir(), 'asc-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  const packed = JSON.parse(execFileSync(npm, ['pack','--json','--pack-destination',folder], {encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
  for (const item of packed.files) assert.ok(/^(dist\/|resources\/|package.json$|README.md$|LICENSE$)/.test(item.path), `Unexpected package file: ${item.path}`);
  writeFileSync(path.join(folder,'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(npm, ['install','--omit=dev','--ignore-scripts',path.join(folder,packed.filename)], {cwd:folder,stdio:'pipe'});
  const executable = path.join(folder,'node_modules/@thatfactory/app-store-connect-mcp/dist/index.js');
  if (process.platform !== 'win32') assert.ok(statSync(executable).mode & 0o111);
  assert.match(execFileSync(process.execPath,[executable,'--help'],{cwd:folder,encoding:'utf8'}),/stdio/);
  assert.equal(execFileSync(process.execPath,[executable,'--version'],{cwd:folder,encoding:'utf8'}).trim(),packed.version);
  const appRoot = path.join(folder, 'AppStore');
  mkdirSync(appRoot);
  writeFileSync(path.join(appRoot, 'app.json'), JSON.stringify({schemaVersion:1,app:{bundleId:'com.example.synthetic',primaryLocale:'en-US'},platforms:['MAC_OS'],localizations:['en-US']}));
  if(process.platform==='darwin') {
    const version=path.join(appRoot,'versions/macOS/1.0');
    mkdirSync(path.join(version,'localizations/en-US'),{recursive:true});
    mkdirSync(path.join(appRoot,'assets'));
    copyFileSync(new URL('../tests/screenshots/rgb.png',import.meta.url),path.join(appRoot,'assets/screen.png'));
    writeFileSync(path.join(version,'version.json'),JSON.stringify({schemaVersion:1,platform:'MAC_OS',versionString:'1.0'}));
    writeFileSync(path.join(version,'localizations/en-US/screenshots.json'),JSON.stringify({mode:'merge',sets:{APP_DESKTOP:['assets/screen.png']}}));
  }
  await protocolSmoke(process.execPath,[executable,'--allowed-root',folder],folder,appRoot,packed.version);
  console.log(`Packed artifact: ${packed.files.length} allowlisted files; clean production install, help/version, MCP tools/resources passed.`);
} finally { rmSync(folder,{recursive:true,force:true}); }
