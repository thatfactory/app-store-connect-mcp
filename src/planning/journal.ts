import { mkdir, lstat, realpath, open, rename, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { contains } from '../repository/files.js';
import { AppStoreError } from '../errors.js';
export class JournalStore {
  private constructor(readonly directory:string){}
  static async create(root:string,allowedRoots:readonly string[]):Promise<JournalStore>{
    const actual=await realpath(root);const parent=path.dirname(actual);
    if(!allowedRoots.some(allowed=>contains(allowed,actual)&&contains(allowed,parent)))throw new AppStoreError('unsafeRoot','Plan state requires an approved checkout containing AppStore and its sibling state directory.');
    const directory=path.join(parent,'.appstore-connect-mcp');
    try{await mkdir(directory,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    const entry=await lstat(directory);
    if(!entry.isDirectory()||entry.isSymbolicLink()||await realpath(directory)!==directory)throw new AppStoreError('unsafePath','Plan state directory must be a contained real directory.');
    await chmod(directory,0o700);return new JournalStore(directory);
  }
  async #write(file:string,text:string):Promise<void>{
    const handle=await open(file,'wx',0o600);
    try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
  }
  async save(id:string,kind:'plan'|'journal',data:unknown):Promise<string>{
    if(!/^[0-9a-f-]{36}$/.test(id))throw new AppStoreError('invalidPlan','Invalid internal plan identity.');
    const serialized=JSON.stringify(data,null,2)+'\n';
    if(Buffer.byteLength(serialized)>1_048_576)throw new AppStoreError('planTooLarge','Plan artifact exceeds the local size limit.');
    if((await lstat(this.directory)).isSymbolicLink()||await realpath(this.directory)!==this.directory)throw new AppStoreError('unsafePath','Plan state path changed.');
    const file=path.join(this.directory,`${id}.${kind}.json`);
    if(kind==='plan')await this.#write(file,serialized);
    else {
      const temporary=path.join(this.directory,`${id}.${randomUUID()}.tmp`);
      await this.#write(temporary,serialized);
      await rename(temporary,file);
    }
    const directory=await open(this.directory,'r');try{await directory.sync();}finally{await directory.close();}
    return file;
  }
}
