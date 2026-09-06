import { writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { schemas } from '../src/repository/schemas.js';
for(const [name,schema] of Object.entries(schemas)){
  const json=JSON.stringify(z.toJSONSchema(schema),null,2)+'\n';
  const file=new URL(`../resources/schemas/${name}.json`,import.meta.url);
  if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==json)throw new Error(`Schema drift: ${name}`);}else await writeFile(file,json);
}
