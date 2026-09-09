import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('publish workflow requires a protected exact published tag and immutable commit',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/publish.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:\n\s+inputs:\n\s+tag:/);assert.match(workflow,/release:\n\s+types: \[published\]/);
  assert.match(workflow,/preflight:/);assert.match(workflow,/if: github\.event_name == 'release' \|\| github\.ref == 'refs\/heads\/main'/);assert.match(workflow,/environment: npm-publish/);assert.match(workflow,/needs: preflight/);
  assert.match(workflow,/id-token: write/);assert.match(workflow,/contents: read/);
  assert.match(workflow,/RELEASE_TAG: \$\{\{ github\.event\.release\.tag_name \|\| inputs\.tag \}\}/);assert.doesNotMatch(workflow,/RELEASE_TAG="\$\{\{/);
  assert.match(workflow,/git\/ref\/tags\/\$RELEASE_TAG/);assert.match(workflow,/releases\/tags\/\$RELEASE_TAG/);assert.match(workflow,/OBJECT_TYPE" != "commit/);
  assert.match(workflow,/OBJECT_SHA" != "\$GITHUB_SHA/);assert.match(workflow,/sha: \$\{\{ steps\.release\.outputs\.sha \}\}/);assert.match(workflow,/ref: \$\{\{ needs\.preflight\.outputs\.sha \}\}/);
  assert.match(workflow,/node-version: 24/);assert.match(workflow,/run: npm ci/);assert.match(workflow,/run: npm run check/);
  assert.match(workflow,/PACKAGE_VERSION=/);assert.match(workflow,/cancel-in-progress: false/);assert.ok(workflow.indexOf('PACKAGE_VERSION=')<workflow.indexOf('npm publish --access public'));
  assert.doesNotMatch(workflow,/NODE_AUTH_TOKEN|NPM_TOKEN|APPSTORE_CONNECT_API/);
});

test('release documentation describes automatic publishing and completed bootstrap',async()=>{
  const readme=await readFile(new URL('../../README.md',import.meta.url),'utf8');const release=await readFile(new URL('../../Documentation/Release.md',import.meta.url),'utf8');
  assert.match(release,/release: published/);assert.match(release,/no manual workflow dispatch or environment approval/);
  assert.match(release,/one-time owner-authenticated npm bootstrap is complete/);assert.match(release,/environment `npm-publish`/);
  assert.match(release,/tag must exactly match `package.json`/);assert.match(readme,/automatically starts npm publication/);assert.doesNotMatch(readme,/not published|NPM-ready/);
});

test('release preflight verifies immutable tags, main ancestry and published release without npm access',async t=>{
  const workflow=await readFile(new URL('../../.github/workflows/publish.yml',import.meta.url),'utf8');
  const script=workflow.match(/        run: \|\n([\s\S]*?)\n\n  publish:/)[1].split('\n').map(line=>line.slice(10)).join('\n');
  const folder=await mkdtemp(path.join(tmpdir(),'asc-release-preflight-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  await writeFile(path.join(folder,'gh'),`#!/bin/bash
set -eu
case "$2" in
  */git/ref/tags/*) printf '%s\\t%s\\n' "$TEST_SHA" "$TEST_TYPE" ;;
  */git/tags/*) printf '%s\\t%s\\n' "$TEST_SHA" commit ;;
  */compare/*) printf '%s\\n' "$TEST_STATUS" ;;
  */releases/tags/*) printf '%s\\n' "$TEST_DRAFT" ;;
  *) exit 99 ;;
esac
`,{mode:0o755});
  const sha='a'.repeat(40);
  const base={PATH:folder+path.delimiter+process.env.PATH,GITHUB_REPOSITORY:'example/synthetic',GITHUB_EVENT_NAME:'release',GITHUB_SHA:sha,RELEASE_TAG:'0.1.1',TEST_SHA:sha,TEST_TYPE:'commit',TEST_STATUS:'identical',TEST_DRAFT:'false',GITHUB_OUTPUT:path.join(folder,'output')};
  for(const change of [{},{TEST_TYPE:'tag'},{TEST_STATUS:'ahead'},{GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'b'.repeat(40),TEST_STATUS:'ahead'}]){
    await writeFile(base.GITHUB_OUTPUT,'');
    execFileSync('bash',['-euo','pipefail','-c',script],{env:{...base,...change},stdio:'pipe'});
    assert.equal((await readFile(base.GITHUB_OUTPUT,'utf8')).trim(),'sha='+sha);
  }
  for(const change of [{RELEASE_TAG:'bad;tag'},{TEST_TYPE:'tree'},{TEST_SHA:'b'.repeat(40)},{TEST_STATUS:'behind'},{TEST_STATUS:'diverged'},{TEST_DRAFT:'true'}]){
    await writeFile(base.GITHUB_OUTPUT,'');
    assert.throws(()=>execFileSync('bash',['-euo','pipefail','-c',script],{env:{...base,...change},stdio:'pipe'}));
    assert.equal(await readFile(base.GITHUB_OUTPUT,'utf8'),'');
  }
});
