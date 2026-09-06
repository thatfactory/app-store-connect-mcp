import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const raw = fs.readFileSync(new URL('../../contracts/apple-openapi.json', import.meta.url));
const schema = JSON.parse(raw);
const provenance = JSON.parse(fs.readFileSync(new URL('../../contracts/provenance.json', import.meta.url)));
test('official contract excerpt matches its reviewed checksum', () => {
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), provenance.excerptSha256);
  assert.equal(schema.info.version, provenance.version);
});
test('every selected schema reference resolves locally', () => {
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) assert.ok(value.$ref.split('/').slice(1).reduce((node, key) => node?.[key], schema), value.$ref);
    Object.values(value).forEach(visit);
  }
  visit(schema);
});
test('manual app bootstrap cannot be confused with bundle registration', () => {
  assert.equal(schema.paths['/v1/apps'].post, undefined);
  assert.ok(schema.paths['/v1/bundleIds'].post);
  assert.deepEqual(schema.components.schemas.BundleIdPlatform.enum, ['IOS', 'MAC_OS', 'UNIVERSAL']);
});
test('availability and screenshots use audited resource relationships', () => {
  assert.ok(schema.paths['/v2/appAvailabilities'].post);
  assert.ok(schema.paths['/v1/appScreenshotSets/{id}/relationships/appScreenshots'].patch);
  assert.ok(schema.paths['/v1/appStoreVersionLocalizations/{id}/appScreenshotSets'].get);
  const create = schema.components.schemas.AppScreenshotCreateRequest.properties.data;
  assert.deepEqual(create.properties.attributes.required, ['fileName', 'fileSize']);
  assert.deepEqual(create.properties.relationships.required, ['appScreenshotSet']);
});
test('submission has a distinct workflow instead of ordinary version sync', () => {
  assert.ok(schema.paths['/v1/reviewSubmissions'].post);
  assert.ok(schema.paths['/v1/reviewSubmissionItems'].post);
  assert.equal(schema.components.schemas.ReviewSubmissionUpdateRequest.properties.data.properties.attributes.properties.submitted.type, 'boolean');
});

// Focused structural fixture checker, not a general JSON Schema implementation.
function accepts(value, rule) {
  if (rule.$ref) return accepts(value, schema.components.schemas[rule.$ref.split('/').at(-1)]);
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type === 'object') return !!value && !Array.isArray(value) && typeof value === 'object'
    && (rule.required || []).every(key => Object.hasOwn(value, key))
    && Object.entries(value).every(([key, item]) => rule.properties?.[key] && accepts(item, rule.properties[key]));
  if (rule.type === 'array') return Array.isArray(value) && value.every(item => accepts(item, rule.items));
  if (rule.type === 'integer') return Number.isInteger(value);
  if (rule.type) return typeof value === rule.type;
  return true;
}
for (const file of fs.readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('Request.json'))) {
  const fixture = JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
  test(`${fixture.schema} requires a structured resource payload`, () => {
    assert.equal(accepts(fixture.valid, schema.components.schemas[fixture.schema]), true);
    assert.equal(accepts(fixture.invalid, schema.components.schemas[fixture.schema]), false);
  });
}
