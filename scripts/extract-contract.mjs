import fs from 'node:fs';
import crypto from 'node:crypto';
const raw = fs.readFileSync(process.argv[2]);
const provenance = JSON.parse(fs.readFileSync('contracts/provenance.json'));
if (crypto.createHash('sha256').update(raw).digest('hex') !== provenance.schemaSha256) throw new Error('Unrecognized schema; audit before updating the pin');
const source = JSON.parse(raw);
const pinned = JSON.parse(fs.readFileSync('contracts/apple-openapi.json'));
const schemas = {};
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/components/schemas/')) {
    const name = value.$ref.split('/').at(-1);
    if (!schemas[name]) { schemas[name] = source.components.schemas[name]; visit(schemas[name]); }
  }
  Object.values(value).forEach(visit);
}
const paths = Object.fromEntries(Object.keys(pinned.paths).map(path => [path, source.paths[path]]));
visit(paths);
const output = JSON.stringify({openapi: source.openapi, info: source.info, paths, components: {schemas}}, null, 2) + '\n';
if (crypto.createHash('sha256').update(output).digest('hex') !== provenance.excerptSha256) throw new Error('Excerpt differs from reviewed contract');
console.log('Pinned excerpt reproduced exactly');
