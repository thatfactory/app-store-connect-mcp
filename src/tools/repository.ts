import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Configuration } from '../config.js';
import { selectionSchema } from '../repository/schemas.js';
import { validateRepository } from '../repository/validate.js';
import { publicError } from '../errors.js';
export function registerRepository(server:McpServer,config:Configuration):void{
  server.registerTool('validate_repository',{
    description:'Validate selected AppStore domains/locales offline. Does not mutate files, execute project tools, or require Apple credentials. Omitted fields remain unmanaged.',
    inputSchema:selectionSchema,
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async(args,extra)=>{
    try{
      const validation=await validateRepository(args,config.allowedRoots,process.env,extra.signal);
      const result={valid:validation.valid,diagnostics:validation.diagnostics.slice(0,200),diagnosticCount:validation.diagnostics.length,truncated:validation.diagnostics.length>200,filesChecked:Object.keys(validation.hashes).length,measurements:Object.fromEntries(Object.entries(validation.measurements).slice(0,100))};
      return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
    }catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify(publicError(error))}]};}
  });
}
