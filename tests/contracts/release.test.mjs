import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('publish workflow requires a protected exact published tag and immutable commit',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/publish.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:\n\s+inputs:\n\s+tag:/);assert.doesNotMatch(workflow,/\n  release:/);
  assert.match(workflow,/preflight:/);assert.match(workflow,/if: github\.ref == 'refs\/heads\/main'/);assert.match(workflow,/environment: npm-publish/);assert.match(workflow,/needs: preflight/);
  assert.match(workflow,/id-token: write/);assert.match(workflow,/contents: read/);
  assert.match(workflow,/RELEASE_TAG: \$\{\{ inputs\.tag \}\}/);assert.doesNotMatch(workflow,/RELEASE_TAG="\$\{\{/);
  assert.match(workflow,/git\/ref\/tags\/\$RELEASE_TAG/);assert.match(workflow,/releases\/tags\/\$RELEASE_TAG/);assert.match(workflow,/OBJECT_TYPE" != "commit/);
  assert.match(workflow,/OBJECT_SHA" != "\$GITHUB_SHA/);assert.match(workflow,/sha: \$\{\{ steps\.release\.outputs\.sha \}\}/);assert.match(workflow,/ref: \$\{\{ needs\.preflight\.outputs\.sha \}\}/);
  assert.match(workflow,/node-version: 24/);assert.match(workflow,/run: npm ci/);assert.match(workflow,/run: npm run check/);
  assert.match(workflow,/PACKAGE_VERSION=/);assert.doesNotMatch(workflow,/github\.event_name/);assert.ok(workflow.indexOf('PACKAGE_VERSION=')<workflow.indexOf('npm publish --access public'));
  assert.doesNotMatch(workflow,/NODE_AUTH_TOKEN|NPM_TOKEN|APPSTORE_CONNECT_API/);
});

test('release candidate documents the one-time registry bootstrap without claiming publication',async()=>{
  const packageJson=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));const readme=await readFile(new URL('../../README.md',import.meta.url),'utf8');const release=await readFile(new URL('../../Documentation/Release.md',import.meta.url),'utf8');
  assert.equal(packageJson.version,'0.1.0');assert.match(release,/tag `0\.1\.0`/);assert.match(release,/one-time owner-authenticated npm CLI session/);assert.match(release,/package to exist before a trusted publisher/);assert.match(release,/explicitly enable the trusted publisher's direct `npm publish` permission/);assert.match(release,/separate owner authorization/);assert.match(readme,/not published/);assert.match(readme,/NPM-ready/);
});
