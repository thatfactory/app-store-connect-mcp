import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../../', import.meta.url);
test('documentation links resolve inside the repository', () => {
  function inspect(relative) {
    const entry = new URL(relative, root);
    if (fs.statSync(entry).isDirectory()) {
      for (const child of fs.readdirSync(entry)) inspect(`${relative}/${child}`);
      return;
    }
    if (!relative.endsWith('.md')) return;
    for (const match of fs.readFileSync(entry, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#)/.test(target)) continue;
      assert.ok(fs.existsSync(new URL(path.join(path.dirname(relative), target.split('#')[0]), root)), `${relative}: ${target}`);
    }
  }
  inspect('Documentation');
  inspect('README.md');
});
