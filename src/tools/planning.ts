import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { publicError } from '../errors.js';
import type { PlanEngine } from '../planning/engine.js';
export function registerPlanning(server:McpServer,engine:PlanEngine):void{
  const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data as Record<string,unknown>});
  const failure=(error:unknown)=>({isError:true,...result(publicError(error))});
  server.registerTool('apply_plan',{
    description:'Apply the exact host-authorized subset of an immutable, current-process domain plan. Requires write mode; rejects submission. Never accepts endpoints or plan-file paths. Unknown outcomes are read back, never replayed.',
    inputSchema:z.object({planId:z.uuid(),digest:z.string().regex(/^[0-9a-f]{64}$/),operationIds:z.array(z.string().min(1).max(128)).max(200),authorization:z.object({confirmedByHost:z.literal(true)}).strict()}).strict(),
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true},
  },async(args,extra)=>{try{return result(await engine.apply(args,extra.signal));}catch(error){return failure(error);}});
  server.registerTool('get_operation_status',{
    description:'Inspect a current-process plan journal. Optional polling only reads back previously approved uncertain operations; it never executes remaining writes. Journal files remain available after process exit, but execution requires a fresh plan.',
    inputSchema:z.object({planId:z.uuid(),poll:z.boolean().default(false)}).strict(),
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },async(args,extra)=>{try{return result(await engine.status(args.planId,args.poll,extra.signal));}catch(error){return failure(error);}});
}
