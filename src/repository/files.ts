import { constants } from 'node:fs';
import { open, realpath, stat, opendir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppStoreError } from '../errors.js';
export function contains(root:string,target:string):boolean{const relative=path.relative(root,target);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
export function safeRelative(relative:string):boolean{return relative.length>0&&!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.includes(':')&&!relative.includes('\0')&&relative.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');}
export class RepositoryFiles {
  readonly hashes:Record<string,string>={};
  #bytes=0;#count=0;
  readonly #directoryBudget={remaining:2000};
  private constructor(readonly root:string,private readonly signal?:AbortSignal){}
  static async create(requested:string,allowedRoots:readonly string[],signal?:AbortSignal):Promise<RepositoryFiles>{
    if(!path.isAbsolute(requested))throw new AppStoreError('unsafeRoot','AppStore root must be absolute.');
    let root:string;try{root=await realpath(requested);}catch{throw new AppStoreError('unsafeRoot','AppStore root does not exist.');}
    if(!allowedRoots.some(allowed=>contains(allowed,root))||!(await stat(root)).isDirectory())throw new AppStoreError('unsafeRoot','AppStore root is outside approved directories.');
    return new RepositoryFiles(root,signal);
  }
  async read(relative:string,required=false,maxBytes=1_048_576):Promise<Buffer|undefined>{
    this.signal?.throwIfAborted();
    if(!safeRelative(relative))throw new AppStoreError('unsafePath','Only contained relative paths are allowed.');
    const requested=path.join(this.root,relative);let resolved:string;
    try{resolved=await realpath(requested);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&!required)return undefined;throw new AppStoreError('missingFile','Required local file is unavailable.');}
    if(!contains(this.root,resolved))throw new AppStoreError('unsafePath','File resolves outside the approved AppStore root.');
    const handle=await open(resolved,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const before=await handle.stat();
      const currentPath=await realpath(requested);
      if(!contains(this.root,currentPath))throw new AppStoreError('unsafePath','File path changed outside approved root.');
      const current=await stat(currentPath);
      if(!before.isFile()||before.ino!==current.ino||before.dev!==current.dev)throw new AppStoreError('unsafePath','File identity changed during inspection.');
      if(before.size>maxBytes||++this.#count>2000||this.#bytes+before.size>64*1024*1024)throw new AppStoreError('inputLimit','Repository input exceeds local file/byte limits.');
      this.#bytes+=before.size;
      // Fixed-size allocation prevents a concurrently growing file escaping the cap.
      const bytes=Buffer.alloc(before.size+1);let length=0;
      while(length<bytes.length){this.signal?.throwIfAborted();const read=await handle.read(bytes,length,bytes.length-length,null);if(!read.bytesRead)break;length+=read.bytesRead;}
      const after=await handle.stat();
      if(length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new AppStoreError('inputChanged','File changed during inspection.');
      const result=bytes.subarray(0,length);this.hashes[relative]=createHash('sha256').update(result).digest('hex');return result;
    }finally{await handle.close();}
  }
  async directories(relative:string):Promise<string[]>{
    this.signal?.throwIfAborted();if(!safeRelative(relative))throw new AppStoreError('unsafePath','Invalid directory path.');
    let resolved:string;try{resolved=await realpath(path.join(this.root,relative));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw new AppStoreError('unsafePath','Directory is unavailable.');}
    if(!contains(this.root,resolved))throw new AppStoreError('unsafePath','Directory escapes the approved root.');
    const directory=await opendir(resolved,{bufferSize:1});
    // Async iteration closes the handle on completion, cancellation, or throw.
    return collectDirectoryNames(directory,this.#directoryBudget,this.signal);
  }
}

interface DirectoryEntry {name:string;isDirectory():boolean;isSymbolicLink():boolean}
export async function collectDirectoryNames(entries:AsyncIterable<DirectoryEntry>,budget:{remaining:number},signal?:AbortSignal):Promise<string[]>{
  const names:string[]=[];
  for await(const entry of entries){
    signal?.throwIfAborted();
    if(budget.remaining--<=0)throw new AppStoreError('inputLimit','Directory entry limit exceeded across the validation request.');
    if(entry.isDirectory()||entry.isSymbolicLink())names.push(entry.name);
  }
  return names.sort();
}
