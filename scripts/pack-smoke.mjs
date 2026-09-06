import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
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
  assert.equal(execFileSync(process.execPath,[executable,'--version'],{cwd:folder,encoding:'utf8'}).trim(),'1.0.0');
  await protocolSmoke(process.execPath,[executable],folder);
  console.log(`Packed artifact: ${packed.files.length} allowlisted files; clean production install, help/version, MCP tools/resources passed.`);
} finally { rmSync(folder,{recursive:true,force:true}); }
