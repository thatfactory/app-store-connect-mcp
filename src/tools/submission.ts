import {z} from 'zod';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Configuration} from '../config.js';
import {AuthManager} from '../api/auth.js';
import {ApiClient} from '../api/client.js';
import {publicError} from '../errors.js';
import type {PlanEngine} from '../planning/engine.js';
import {SubmissionAdapter,SubmissionReader,readinessSelection,submissionSelection} from '../domains/submission.js';

const approval=z.object({
  planId:z.uuid(),
  digest:z.string().regex(/^[0-9a-f]{64}$/),
  operationIds:z.array(z.string().min(1).max(128)).max(20),
  authorization:z.object({confirmedByHost:z.literal(true)}).strict(),
}).strict();

export function registerSubmission(server:McpServer,config:Configuration,plans:PlanEngine):void {
  const auth=new AuthManager();
  const api=new ApiClient(auth);
  const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data as Record<string,unknown>});
  const failure=(error:unknown)=>({isError:true,...result(publicError(error))});
  server.registerTool('check_release_readiness',{
    description:'Check one exact existing build and release using local manifests plus bounded App Store Connect evidence. Manual privacy, age-rating, legal and regional obligations remain explicit; passing checks cannot guarantee Apple review acceptance.',
    inputSchema:readinessSelection,
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },async(args,extra)=>{try{
    const value=await new SubmissionReader(args,config.allowedRoots,api,()=>auth.identity()).read(extra.signal);
    const releaseBehavior=value.checks.find(check=>check.name==='releaseBehavior');return result({target:{appId:value.release.appId,bundleId:value.release.bundleId,platform:value.release.build.platform,version:value.release.build.version,buildId:value.release.build.id,buildNumber:value.release.build.buildNumber},checks:value.checks,releaseBehavior:releaseBehavior?.evidence??null});
  }catch(error){return failure(error);}});
  server.registerTool('plan_submission',{
    description:'Create a fresh immutable submission-only plan for one exact processed build. Requires explicit manual confirmations and reports automatic-release behavior. Compatible drafts are reused; unrelated items or active conflicting submissions block planning.',
    inputSchema:submissionSelection,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{
    const reader=new SubmissionReader(args,config.allowedRoots,api,()=>auth.identity());
    return result(await plans.create(new SubmissionAdapter(args,reader,api),extra.signal));
  }catch(error){return failure(error);}});
  server.registerTool('submit_for_review',{
    description:'Execute every operation in an exact fresh submission-only plan. Requires --allow-writes, the independent --allow-submission flag, the exact digest and explicit host confirmation. Uncertain outcomes are read back and never replayed.',
    inputSchema:approval,
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{return result(await plans.submit(args,config.allowSubmission,extra.signal));}catch(error){return failure(error);}});
}
