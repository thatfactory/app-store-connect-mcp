import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Configuration} from '../config.js';
import {AuthManager} from '../api/auth.js';
import {ApiClient} from '../api/client.js';
import {CommerceAdapter,commerceSelection} from '../domains/commerce.js';
import type {PlanEngine} from '../planning/engine.js';
import {publicError} from '../errors.js';

export function registerCommerce(server:McpServer,config:Configuration,plans:PlanEngine):void {
  const auth=new AuthManager();
  const api=new ApiClient(auth);
  const result=(data:Record<string,unknown>)=>({content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data});
  server.registerTool('plan_commerce_changes',{
    description:'Plan explicitly managed app-wide base pricing and compare territory availability. Exact catalog points use decimal strings. Generic territory mutations are unavailable, so availability differences are returned as manualActionRequired with blocker statuses and no write operations.',
    inputSchema:commerceSelection,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{
    try {
      const plan=await plans.create(new CommerceAdapter(args,config.allowedRoots,api,()=>auth.identity()),extra.signal);
      if(JSON.stringify(plan).length>128_000)return result({planId:plan.planId,digest:plan.digest,planPath:plan.planPath,detail:'Inspect the local redacted plan artifact; complete app-wide commerce detail exceeds the display limit.'});
      return result(plan);
    } catch(error) {
      return {isError:true,...result(publicError(error))};
    }
  });
}
