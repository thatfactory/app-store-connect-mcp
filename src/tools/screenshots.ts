import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Configuration} from '../config.js';
import {AuthManager} from '../api/auth.js';
import {ApiClient} from '../api/client.js';
import {ScreenshotAdapter,screenshotSelection} from '../domains/screenshots.js';
import type {PlanEngine} from '../planning/engine.js';
import {publicError} from '../errors.js';
export function registerScreenshots(server:McpServer,config:Configuration,plans:PlanEngine):void{
  const auth=new AuthManager();const api=new ApiClient(auth);
  const result=(data:Record<string,unknown>)=>({content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data});
  server.registerTool('plan_screenshot_changes',{
    description:'Plan exact macOS locale screenshot sets from decoded original bytes. Merge preserves verified unowned images; replace explicitly shows every removal, capacity gap and final order. Pending/unknown bytes require recovery before merge. Writes require approved apply_plan.',
    inputSchema:screenshotSelection,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{
    const plan=await plans.create(new ScreenshotAdapter(args,config.allowedRoots,api,()=>auth.identity()),extra.signal);
    if(JSON.stringify(plan).length>128_000)return result({planId:plan.planId,digest:plan.digest,planPath:plan.planPath,detail:'Inspect the local redacted plan artifact before approving exact operation IDs; detail exceeds the display limit.'});
    return result(plan);
  }catch(error){return {isError:true,...result(publicError(error))};}});
}
