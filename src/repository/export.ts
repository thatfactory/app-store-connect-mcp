import { mkdir, realpath, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { AppStoreError } from '../errors.js';
import { contains, safeRelative } from './files.js';
import { locales, platforms, reviewEnvironment, schemas } from './schemas.js';
import { fingerprint, type StoreState, type Attributes } from '../api/resources/discovery.js';
function subset(attributes:Attributes,fields:string[]):Attributes{return Object.fromEntries(fields.filter(field=>Object.hasOwn(attributes,field)).map(field=>[field,attributes[field]!])) as Attributes;}
export function exportContent(state:StoreState):Record<string,string>{
  if(state.selectionRequired||!state.version||!state.appInfo)throw new AppStoreError('incompleteSnapshot','Select an exact version and resolve app information before export.');
  const version=state.version.attributes;
  const directory=Object.entries(platforms).find(([,value])=>value===version.platform)?.[0];
  if(!directory||typeof version.versionString!=='string'||!safeRelative(version.versionString)||version.versionString.includes('/'))throw new AppStoreError('unsupportedExport','Version identity is not representable in AppStore schema v1.');
  const coverage=[...new Set([...state.appInfoLocalizations,...state.versionLocalizations].map(item=>item.attributes.locale))].sort();
  const primary=state.app.attributes.primaryLocale;
  if(typeof primary!=='string'||!locales.includes(primary as typeof locales[number])||coverage.some(locale=>typeof locale!=='string'||!locales.includes(locale as typeof locales[number])))throw new AppStoreError('unsupportedLocale','Export requires a supported canonical locale registry; no locale was silently dropped.');
  if(!coverage.includes(primary))coverage.push(primary);
  const app={schemaVersion:1,app:{appStoreId:state.app.id,...subset(state.app.attributes,['bundleId','primaryLocale','sku'])},platforms:[version.platform],localizations:coverage};
  const manifest={schemaVersion:1,platform:version.platform,versionString:version.versionString,...subset(version,['copyright','releaseType'])};
  if(!schemas.app.safeParse(app).success||!schemas.version.safeParse(manifest).success)throw new AppStoreError('unsupportedExport','Remote app/version values cannot be represented losslessly by schema v1; no defaults were substituted.');
  const output:Record<string,string>={};
  const json=(file:string,value:unknown):void=>{output[file]=JSON.stringify(value,null,2)+'\n';};
  json('app.json',app);const prefix=`versions/${directory}/${version.versionString}`;json(`${prefix}/version.json`,manifest);
  const infoLocales=new Set<string>();
  for(const info of state.appInfoLocalizations){const locale=String(info.attributes.locale);if(infoLocales.has(locale))throw new AppStoreError('ambiguousLocale','Duplicate app-information locale records.');infoLocales.add(locale);json(`info/${locale}.json`,subset(info.attributes,['name','subtitle','privacyPolicyUrl']));}
  const versionLocales=new Set<string>();
  const textFiles={description:'description.txt',keywords:'keywords.txt',promotionalText:'promotional-text.txt',whatsNew:'whats-new.txt'} as const;
  const nullText:string[]=[];
  for(const localization of state.versionLocalizations){
    const locale=String(localization.attributes.locale);if(versionLocales.has(locale))throw new AppStoreError('ambiguousLocale','Duplicate version locale records.');versionLocales.add(locale);
    const local=`${prefix}/localizations/${locale}`;json(`${local}/metadata.json`,subset(localization.attributes,['supportUrl','marketingUrl']));
    for(const [field,file] of Object.entries(textFiles)){
      const value=localization.attributes[field];if(value===null){nullText.push(`${locale}:${field}`);continue;}
      if(value!==undefined){if(typeof value!=='string')throw new AppStoreError('invalidResponse','Expected localized text.');const normalized=value.replaceAll('\r\n','\n');output[`${local}/${file}`]=normalized+'\n';}
    }
  }
  if(state.review){
    const review:Record<string,unknown>={};
    if(state.review.demoAccountRequired!==undefined)review.demoAccountRequired=state.review.demoAccountRequired;
    for(const [field,env] of Object.entries(reviewEnvironment))if(state.review.presentFields.includes(field))review[field]={env};
    json(`${prefix}/review.json`,review);
  }
  const english={info:state.appInfoLocalizations.filter(item=>item.attributes.locale==='en-US').map(item=>item.attributes),version:state.versionLocalizations.filter(item=>item.attributes.locale==='en-US').map(item=>item.attributes)};
  // Inventory is separate from desired state. No CDN URLs, original-image claims or review text.
  json('export-inventory.json',{schemaVersion:1,appId:state.app.id,appInfoId:state.appInfo.id,versionId:state.version.id,credentialContext:state.credentialContext,snapshotFingerprint:state.fingerprint,englishFingerprint:fingerprint(english),localizations:{appInfo:state.appInfoLocalizations.map(item=>({id:item.id,locale:item.attributes.locale})),version:state.versionLocalizations.map(item=>({id:item.id,locale:item.attributes.locale}))},screenshots:state.screenshotSets,unavailable:state.unavailable,unmanagedNullTextFields:nullText,reviewNotes:'Not exported: owner review required to avoid exposing private information.',screenshotOriginals:'Inventory only; provide original local bytes separately.'});
  return output;
}
export async function exportState(state:StoreState,destination:string,allowedRoots:readonly string[],signal?:AbortSignal):Promise<{destination:string;files:string[];englishFingerprint:string}>{
  const content=exportContent(state);
  if(!path.isAbsolute(destination)||!safeRelative(path.basename(destination)))throw new AppStoreError('unsafePath','Export destination must be an absolute fresh directory.');
  let parent:string;try{parent=await realpath(path.dirname(destination));}catch{throw new AppStoreError('unsafePath','Create an approved parent directory before exporting.');}
  if(!allowedRoots.some(root=>contains(root,parent)))throw new AppStoreError('unsafePath','Export parent is outside approved roots.');
  const target=path.join(parent,path.basename(destination));signal?.throwIfAborted();
  try{await mkdir(target,{mode:0o700});}catch{throw new AppStoreError('exportExists','Export requires a new directory; existing data was not overwritten.');}
  try{
    for(const [relative,bytes] of Object.entries(content)){
      signal?.throwIfAborted();const file=path.join(target,relative);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
      const actualParent=await realpath(path.dirname(file));if(!contains(target,actualParent)||(await lstat(target)).isSymbolicLink())throw new AppStoreError('unsafePath','Export path changed during creation.');
      await writeFile(file,bytes,{flag:'wx',mode:0o600});
    }
  }catch(error){if(error instanceof AppStoreError)throw error;throw new AppStoreError('exportIncomplete','Export interrupted; inspect the partial fresh directory before retrying with another destination.');}
  const inventory=JSON.parse(content['export-inventory.json']!) as {englishFingerprint:string};
  return {destination:target,files:Object.keys(content).sort(),englishFingerprint:inventory.englishFingerprint};
}
