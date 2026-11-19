import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../api/auth.js';
import { ApiClient } from '../api/client.js';
import { TestFlightApi } from '../api/resources/testflight.js';
import type { Configuration } from '../config.js';
import {
  TestFlightConfigurationAdapter, TestFlightDistributionAdapter, TestFlightReader,
  testflightConfigurationSelection, testflightDistributionSelection, testflightGroupSelection, testflightStateSelection,
} from '../domains/testflight.js';
import { publicError } from '../errors.js';
import type { PlanEngine } from '../planning/engine.js';

const readOnly = {readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true};
const planAnnotations = {readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true};
const approval = z.object({
  planId:z.uuid(), digest:z.string().regex(/^[0-9a-f]{64}$/), operationIds:z.array(z.string().min(1).max(128)).min(1).max(200),
  authorization:z.object({confirmedByHost:z.literal(true)}).strict(),
}).strict();

async function reply(work:()=>Promise<Record<string,unknown>>) {
  try {
    const data = await work();
    return {content:[{type:'text' as const, text:JSON.stringify(data)}], structuredContent:data};
  } catch (error) {
    const data = publicError(error);
    return {isError:true, content:[{type:'text' as const, text:JSON.stringify(data)}], structuredContent:data};
  }
}

export function registerTestFlight(server:McpServer, config:Configuration, engine:PlanEngine, api?:TestFlightApi, identity?:()=>string):void {
  const auth = new AuthManager();
  const client = api ?? new TestFlightApi(new ApiClient(auth));
  const account = identity ?? (() => auth.identity());
  const reader = new TestFlightReader(config.allowedRoots, client, account);
  server.registerTool('get_testflight_state', {
    description:'Read the verified app and optional declared external group, with explicit iOS/tvOS builds and separate membership, external testing and beta review observations. Excludes the public join URL.',
    inputSchema:testflightStateSelection, annotations:readOnly,
  }, (args, extra) => reply(() => reader.state(args, extra.signal)));
  server.registerTool('get_testflight_join_link', {
    description:'Explicitly read the enabled TestFlight public join URL for one verified external group. Link enablement does not establish installability.',
    inputSchema:testflightGroupSelection, annotations:readOnly,
  }, (args, extra) => reply(() => reader.joinLink(args, extra.signal)));
  server.registerTool('plan_testflight_configuration', {
    description:'Plan selected beta app locales, review details and external group creation with the link disabled. Existing matching groups are adopted. Execute approved changes with apply_plan.',
    inputSchema:testflightConfigurationSelection, annotations:planAnnotations,
  }, (args, extra) => reply(() => engine.create(new TestFlightConfigurationAdapter(args, config.allowedRoots, client, account), extra.signal)));
  server.registerTool('plan_testflight_distribution', {
    description:'Plan one TestFlight action for a verified external group. Attach exact builds with optional localized notes and build-wide auto-notify, explicitly submit or notify a previously attached build, or reconcile the group public link separately. Apply with apply_testflight_distribution.',
    inputSchema:testflightDistributionSelection, annotations:planAnnotations,
  }, (args, extra) => reply(() => engine.create(new TestFlightDistributionAdapter(args, config.allowedRoots, client, account), extra.signal)));
  server.registerTool('apply_testflight_distribution', {
    description:'Apply the exact host-approved operation IDs in a current TestFlight distribution plan. Requires --allow-writes and --allow-beta-distribution. Apple review and availability are separate observations. Uncertain writes are read back without replay.',
    inputSchema:approval, annotations:{...planAnnotations, destructiveHint:true},
  }, (args, extra) => reply(async () => ({...await engine.distributeBeta(args, config.allowBetaDistribution, extra.signal)})));
}
