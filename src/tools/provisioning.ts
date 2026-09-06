import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Configuration } from '../config.js';
import { AuthManager } from '../api/auth.js';
import { ApiClient } from '../api/client.js';
import { AppStoreError,publicError } from '../errors.js';
import { ProvisioningAdapter,provisioningSelection,readBundleState } from '../domains/provisioning.js';
import type { PlanEngine } from '../planning/engine.js';
import { inspectSchema,inspectXcode } from '../xcode/inspect.js';
export function registerProvisioning(server:McpServer,config:Configuration,plans:PlanEngine):void{
  const auth=new AuthManager();const api=new ApiClient(auth);
  const result=(data:Record<string,unknown>)=>{const text=JSON.stringify(data);if(text.length>128_000)throw new AppStoreError('resultTooLarge','Select a smaller inspection scope.');return {content:[{type:'text' as const,text}],structuredContent:data};};
  const failure=(error:unknown)=>({isError:true,...result(publicError(error))});
  server.registerTool('get_bundle_id_state',{description:'Read one exact bundle identifier and its portal platform/capabilities before authoring provisioning.json. Returns absent explicitly; never registers anything.',inputSchema:z.object({identifier:provisioningSelection.shape.identifiers.element}).strict(),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},async(args,extra)=>{try{return result(await readBundleState(api,args.identifier,extra.signal));}catch(error){return failure(error);}});
  server.registerTool('inspect_xcode_project',{description:'Statically inspect one explicit app/extension target, configuration and platform using Apple plutil. No xcodebuild, scripts, dependency resolution or project edits. Unresolved settings remain provisional; proposals never register identifiers.',inputSchema:inspectSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(args,extra)=>{try{return result(await inspectXcode(args,config.allowedRoots,extra.signal));}catch(error){return failure(error);}});
  server.registerTool('plan_provisioning_changes',{description:'Read exact identifiers explicitly selected from AppStore provisioning.json and produce an immutable approval plan. Preserves omitted capabilities, never deletes signing resources or rewrites projects. Capability changes can invalidate profiles; regeneration and APNs credentials are separate owner tasks.',inputSchema:provisioningSelection,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},async(args,extra)=>{try{
    const plan=await plans.create(new ProvisioningAdapter(args,config.allowedRoots,api,()=>auth.identity()),extra.signal);
    const output={...plan,impacts:['Capability changes can invalidate existing provisioning profiles across eligible platforms. No signing assets are automatically regenerated.','Push capability registration does not create APNs credentials. Additional service configuration remains separate.']};
    if(JSON.stringify(output).length>128_000)return result({planId:plan.planId,digest:plan.digest,planPath:plan.planPath,detail:'Plan exceeds display limit; inspect the local redacted plan artifact before approving exact operation IDs.'});
    return result(output);
  }catch(error){return failure(error);}});
}
