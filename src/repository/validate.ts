import {validateImage,type ImageIdentity} from '../screenshots/validate.js';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppStoreError } from '../errors.js';
import { RepositoryFiles, safeRelative } from './files.js';
import { parseJson } from './json.js';
import { schemas, domains, platforms, reviewEnvironment, selectionSchema, type Selection, type AppManifest } from './schemas.js';
export interface Diagnostic {path:string;locale?:string;field:string;rule:string;severity:'error'|'advisory';message:string}
export interface ValidatedRepository {images:Record<string,ImageIdentity>;valid:boolean;diagnostics:Diagnostic[];hashes:Record<string,string>;desired:Record<string,unknown>;secretFingerprint:string;measurements:Record<string,{codePoints:number;utf16Units:number;graphemes:number;utf8Bytes:number}>}
const secretKey=randomBytes(32);
const textFields={'description.txt':['description',4000,'characters'],'keywords.txt':['keywords',100,'bytes'],'promotional-text.txt':['promotionalText',170,'characters'],'whats-new.txt':['whatsNew',4000,'characters']} as const;
export async function validateRepository(selection:Selection,allowedRoots:readonly string[],environment:Readonly<Record<string,string|undefined>>=process.env,signal?:AbortSignal):Promise<ValidatedRepository>{
  if(signal?.aborted)throw new AppStoreError('cancelled','Repository validation cancelled.');
  const parsedSelection=selectionSchema.safeParse(selection);
  if(!parsedSelection.success)throw new AppStoreError('invalidSelection','Use supported domains, locales and explicit version selectors.');
  selection=parsedSelection.data;
  const files=await RepositoryFiles.create(selection.root,allowedRoots,signal);
  const images:Record<string,ImageIdentity>={};
  const diagnostics:Diagnostic[]=[];const desired:Record<string,unknown>={};const measurements:ValidatedRepository['measurements']={};
  const selected=new Set(selection.domains??domains);const secrets:Record<string,string>={};
  const report=(file:string,field:string,rule:string,message:string,severity:'error'|'advisory'='error',locale?:string):void=>{diagnostics.push({path:file,field,rule,severity,message,...(locale?{locale}:{})});};
  async function read(file:string,required=false,maxBytes?:number):Promise<Buffer|undefined>{
    try{return await files.read(file,required,maxBytes);}catch(error){if(signal?.aborted)throw new AppStoreError('cancelled','Repository validation cancelled.');report(file,'',error instanceof AppStoreError?error.code:'unreadableFile','Use an unchanged regular file contained in the approved root.');return undefined;}
  }
  function decode(bytes:Buffer,file:string):string|undefined{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{report(file,'','invalidUtf8','Save this file as valid UTF-8.');return undefined;}}
  async function json<T>(file:string,schema:z.ZodType<T>,required=false):Promise<T|undefined>{
    const bytes=await read(file,required);if(!bytes)return undefined;const text=decode(bytes,file);if(text===undefined)return undefined;
    let value:unknown;try{value=parseJson(text);}catch(error){if(signal?.aborted)throw new AppStoreError('cancelled','Repository validation cancelled.');report(file,'',error instanceof AppStoreError?error.code:'invalidJson','Use strict JSON without duplicate keys or executable configuration.');return undefined;}
    const parsed=schema.safeParse(value);if(!parsed.success){for(const issue of parsed.error.issues)report(file,issue.path.join('.'),'schemaViolation',`Field does not match schema v1 (${issue.code}); check the published schema.`);return undefined;}
    desired[file]=parsed.data;return parsed.data;
  }
  function checkUrl(value:unknown,file:string,field:string):void{
    if(typeof value!=='string')return;
    try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hostname==='localhost'||/\.(invalid|test|example)$/.test(url.hostname)||['example.com','example.org','example.net'].includes(url.hostname))throw new Error();}
    catch{report(file,field,'invalidUrl','Supply an owner-reviewed public HTTP(S) URL without credentials or placeholders.');}
  }
  function unique(values:readonly string[],file:string,field:string):void{if(new Set(values).size!==values.length)report(file,field,'duplicateValue','Remove duplicate entries; their order is otherwise preserved.');}
  async function text(file:string,field:string,max:number,unit:string,locale?:string):Promise<void>{
    const bytes=await read(file);if(!bytes)return;const original=decode(bytes,file);if(original===undefined)return;
    const normalized=original.replaceAll('\r\n','\n').replace(/\n$/,'');
    if(normalized!==original)report(file,field,'normalizedNewline','CRLF and one terminal newline are normalized for upload.','advisory',locale);
    const counts={codePoints:[...normalized].length,utf16Units:normalized.length,graphemes:[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(normalized)].length,utf8Bytes:Buffer.byteLength(normalized)};measurements[file]=counts;
    if((unit==='bytes'?counts.utf8Bytes:counts.utf16Units)>max)report(file,field,'fieldLimit',`Limit is ${max} ${unit==='bytes'?'UTF-8 bytes':'conservative UTF-16 units'}; edit the source explicitly.`,'error',locale);
    if(/(?:\bTODO\b|\bTBD\b|\bPLACEHOLDER\b|example\.invalid)/i.test(normalized))report(file,field,'placeholder','Replace placeholder content before synchronization.','error',locale);
    if(field==='keywords'){
      if(/[\r\n]/.test(normalized))report(file,field,'singleLine','Keywords must be one comma-separated line.','error',locale);
      const words=normalized.split(',');if(words.some(word=>word!==word.trim())||new Set(words.map(word=>word.trim())).size!==words.length)report(file,field,'keywordAdvice','Review separator whitespace and repeated keywords; content was not changed.','advisory',locale);
    }
    desired[file]=normalized;
  }
  const app=await json('app.json',schemas.app,true);
  if(app){
    unique(app.platforms,'app.json','platforms');unique(app.localizations,'app.json','localizations');
    if(!app.localizations.includes(app.app.primaryLocale))report('app.json','app.primaryLocale','localeCoverage','Include the primary locale in intended coverage.');
    if(app.project&&!safeRelative(app.project.path))report('app.json','project.path','unsafePath','Project inspection paths must be repository-relative and contained.');
    const locales=selection.locales??app.localizations;
    for(const locale of locales)if(!app.localizations.includes(locale))report('app.json','localizations','unmanagedLocale','Selected locale is not declared in app.json.','error',locale);
    if(selected.has('appInfo')){
      checkUrl(app.defaults?.privacyPolicyUrl,'app.json','defaults.privacyPolicyUrl');
      for(const locale of locales){const file=`info/${locale}.json`;const info=await json(file,schemas.info);checkUrl(info?.privacyPolicyUrl,file,'privacyPolicyUrl');
        for(const field of ['name','subtitle'] as const)if(typeof info?.[field]==='string'&&/\b(TODO|TBD|PLACEHOLDER)\b/i.test(info[field]))report(file,field,'placeholder','Replace placeholder text before synchronization.','error',locale);}
    }
    if(selected.has('commerce')){const commerce=await json('commerce.json',schemas.commerce);if(commerce&&Array.isArray(commerce.availability?.territories))unique(commerce.availability.territories,'commerce.json','availability.territories');}
    if(selected.has('provisioning'))await json('provisioning.json',schemas.provisioning);
    if([...selected].some(domain=>['versionMetadata','version','review','screenshots'].includes(domain))){
      const dirs=selection.platform?[selection.platform]:Object.keys(platforms).filter(key=>app.platforms.includes(platforms[key as keyof typeof platforms]));
      let versionCount=0;
      for(const directory of dirs){
        if(!app.platforms.includes(platforms[directory as keyof typeof platforms])){report('app.json','platforms','platformMismatch','Selected platform is not declared.');continue;}
        let versions:string[];
        try{versions=selection.version?[selection.version]:await files.directories(`versions/${directory}`);}catch{report(`versions/${directory}`,'','unsafePath','Version directory must be contained and bounded.');continue;}
        for(const version of versions){
          const prefix=`versions/${directory}/${version}`;if(!safeRelative(prefix)){report('versions','','unsafePath','Invalid version directory.');continue;}
          versionCount++;const versionFile=`${prefix}/version.json`;const manifest=await json(versionFile,schemas.version,true);if(!manifest)continue;
          if(manifest.platform!==platforms[directory as keyof typeof platforms]||manifest.versionString!==version)report(versionFile,'','versionMismatch','Platform and versionString must exactly match the directory.');
          if(selected.has('versionMetadata')){
            checkUrl(manifest.defaults?.supportUrl,versionFile,'defaults.supportUrl');
            for(const locale of locales){const local=`${prefix}/localizations/${locale}`;const metadata=await json(`${local}/metadata.json`,schemas.metadata);checkUrl(metadata?.supportUrl,`${local}/metadata.json`,'supportUrl');checkUrl(metadata?.marketingUrl,`${local}/metadata.json`,'marketingUrl');for(const [name,[field,max,unit]] of Object.entries(textFields))await text(`${local}/${name}`,field,max,unit,locale);}
          }
          if(selected.has('review')){
            const file=`${prefix}/review.json`;const review=await json(file,schemas.review);
            if(review)for(const [field,name] of Object.entries(reviewEnvironment)){
              const value=review[field as keyof typeof review];if(value&&typeof value==='object'&&'env'in value){const secret=environment[name];if(!secret)report(file,field,'missingReviewSecret','Required review environment value is missing.');else secrets[name]=secret;}
            }
            await text(`${prefix}/review-notes.txt`,'notes',4000,'bytes');
          }
          if(selected.has('screenshots'))for(const locale of locales){
            const file=`${prefix}/localizations/${locale}/screenshots.json`;const manifest=await json(file,schemas.screenshots);if(!manifest)continue;
            if(directory!=='macOS'&&manifest.sets.APP_DESKTOP)report(file,'sets.APP_DESKTOP','displayMismatch','APP_DESKTOP requires macOS.');
            for(const [display,references] of Object.entries(manifest.sets)){
              if(!references)continue;
              unique(references,file,`sets.${display}`);
              if(references.length===0)report(file,`sets.${display}`,'explicitEmptySet','An empty array requests destructive clearing.','advisory',locale);
              for(const reference of references){
                if(!safeRelative(reference)){report(file,`sets.${display}`,'unsafePath','Screenshot paths must remain within AppStore.');continue;}
                if(!/\.(png|jpe?g)$/i.test(reference)){report(reference,'','imageFormat','Screenshot sources must be PNG or JPEG.');continue;}
                const bytes=await read(reference,true,32*1024*1024);if(bytes?.subarray(0,128).toString().startsWith('version https://git-lfs.github.com/spec/v1'))report(reference,'','gitLfsPointer','Materialize the original image bytes before validation.');
                else if(bytes)try{images[reference]=await validateImage(bytes,reference,signal);}catch(error){if(signal?.aborted)throw new AppStoreError('cancelled','Screenshot validation cancelled.');report(reference,'',error instanceof AppStoreError?error.code:'invalidImage',error instanceof AppStoreError?error.message:'Screenshot decoding failed.');}
                if(!reference.includes(`/${locale}/`))report(file,`sets.${display}`,'sharedLocaleAsset','Review the explicit shared source; no language fallback was inferred.','advisory',locale);
              }
            }
          }
        }
      }
      if(versionCount===0)report('versions','','missingVersion','Add an explicit platform/version directory for selected version domains.');
    }
  }
  if(signal?.aborted)throw new AppStoreError('cancelled','Repository validation cancelled.');
  diagnostics.sort((a,b)=>[a.path,a.field,a.rule].join('\0').localeCompare([b.path,b.field,b.rule].join('\0'),'en'));
  return {images,valid:!diagnostics.some(item=>item.severity==='error'),diagnostics,hashes:files.hashes,desired,secretFingerprint:createHmac('sha256',secretKey).update(JSON.stringify(Object.entries(secrets).sort())).digest('hex'),measurements};
}
export function appManifest(result:ValidatedRepository):AppManifest|undefined{return result.desired['app.json'] as AppManifest|undefined;}
