import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Configuration } from '../config.js';
import { AuthManager } from '../api/auth.js';
import { ApiClient } from '../api/client.js';
import { Discovery, targetSchema, prepareSchema } from '../api/resources/discovery.js';
import { exportState } from '../repository/export.js';
import { publicError } from '../errors.js';
export function registerDiscovery(server:McpServer,config:Configuration):void{
  const auth=new AuthManager();const discovery=new Discovery(new ApiClient(auth),()=>auth.identity());
  const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
  const result=(data:unknown)=>{const text=JSON.stringify(data);return text.length>128_000?{isError:true,content:[{type:'text' as const,text:'Result exceeds the display limit; use an exact bundle/version selector or export to a fresh local directory.'}]}:{content:[{type:'text' as const,text}],...(data&&typeof data==='object'&&!Array.isArray(data)?{structuredContent:data as Record<string,unknown>}: {})};};
  const failure=(error:unknown)=>({isError:true,...result(publicError(error))});
  server.registerTool('list_apps',{description:'Discover apps through public Apple API reads. Bundle ID is an exact filter; names are not identity.',inputSchema:z.object({bundleId:z.string().min(1).max(255).optional(),limit:z.number().int().min(1).max(100).default(20)}).strict(),annotations},async(args,extra)=>{try{const apps=await discovery.apps(args.bundleId,extra.signal);return result({apps:apps.slice(0,args.limit),total:apps.length,truncated:apps.length>args.limit});}catch(error){return failure(error);}});
  server.registerTool('get_app_store_state',{description:'Read a verified app/bundle identity. Omit version to inspect candidates; specify an exact platform/version to read metadata and redacted screenshot/review inventory.',inputSchema:targetSchema,annotations},async(args,extra)=>{try{return result(await discovery.state(args,extra.signal));}catch(error){return failure(error);}});
  server.registerTool('export_app_store_state',{description:'Read Apple state and export into a fresh approved local directory. Refuses overwrite; review secrets and notes are not exported. Screenshot inventory is not original image bytes.',inputSchema:targetSchema.extend({destination:z.string().min(1)}).strict(),annotations:{...annotations,readOnlyHint:false,idempotentHint:false}},async(args,extra)=>{try{const {destination,...target}=args;const state=await discovery.state(target,extra.signal);return result(await exportState(state,destination,config.allowedRoots,extra.signal));}catch(error){return failure(error);}});
  server.registerTool('prepare_app_record',{description:'Confirm an existing app by ID/bundle or report owner-supplied manual bootstrap fields when absent. Never creates an Apple app record.',inputSchema:prepareSchema,annotations},async(args,extra)=>{try{return result(await discovery.prepare(args,extra.signal));}catch(error){return failure(error);}});
}
