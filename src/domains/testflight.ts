import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TestFlightApi, type BetaBuild, type BetaGroup, type BuildIdentity } from '../api/resources/testflight.js';
import type { Attributes, Resource } from '../api/resources/discovery.js';
import { AppStoreError } from '../errors.js';
import { canonical, type Adapter, type Json, type Operation, type Snapshot } from '../planning/model.js';
import { appleId, localeSchema, platformSchema, platforms, testflightGroupKey, type TestFlightGroup, type testflightGroupsSchema, type Selection } from '../repository/schemas.js';
import { appManifest, validateRepository } from '../repository/validate.js';

const root = z.string().min(1);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const locales = z.array(localeSchema).min(1).max(5).refine(unique);
const build = z.object({buildId:appleId, platform:platformSchema}).strict();
const attachBuild = build.extend({autoNotifyEnabled:z.boolean().optional()}).strict();
const uniqueBuilds = (builds: {buildId:string}[]) => unique(builds.map(item => item.buildId));
export const testflightStateSelection = z.object({
  root, groupKey:testflightGroupKey.optional(), builds:z.array(build).max(10).refine(uniqueBuilds).optional(),
}).strict();
export const testflightGroupSelection = z.object({root, groupKey:testflightGroupKey}).strict();
export const testflightConfigurationSelection = z.object({
  root, groups:z.array(testflightGroupKey).min(1).max(20).refine(unique).optional(),
  locales:locales.optional(), review:z.literal(true).optional(),
}).strict().refine(value => !!(value.groups || value.locales || value.review), 'Select at least one configuration scope.');
export const testflightDistributionSelection = z.discriminatedUnion('action', [
  testflightGroupSelection.extend({action:z.literal('publicLink')}),
  testflightGroupSelection.extend({action:z.literal('attach'), builds:z.array(attachBuild).min(1).max(10).refine(uniqueBuilds), locales:locales.optional()}),
  testflightGroupSelection.extend({action:z.literal('submit'), build}),
  testflightGroupSelection.extend({action:z.literal('notify'), build}),
]);

type ConfigurationSelection = z.infer<typeof testflightConfigurationSelection>;
type DistributionSelection = z.infer<typeof testflightDistributionSelection>;
type StateSelection = z.infer<typeof testflightStateSelection>;
type BuildSelection = z.infer<typeof attachBuild>;
type Manifest = z.infer<typeof testflightGroupsSchema>;
type ManagedResource = {id:string; attributes:Attributes};
type BuildDetail = {id:string; autoNotifyEnabled:boolean | null};
type Write =
  | {action:'createGroup'; appId:string; name:string}
  | {action:'publicLink'|'review'; id:string; attributes:Attributes}
  | {action:'localize'; parent:{id:string; type:'apps'|'builds'}; locale:string; id:string|null; attributes:Attributes}
  | {action:'autoNotify'; id:string; value:boolean}
  | {action:'attach'; groupId:string; buildId:string}
  | {action:'submit'|'notify'; buildId:string};

const rulesVersion = 'testflight/2';
const ready = new Set(['READY_FOR_BETA_SUBMISSION','WAITING_FOR_BETA_REVIEW','IN_BETA_REVIEW',
  'BETA_APPROVED','READY_FOR_BETA_TESTING','IN_BETA_TESTING']);
const groupKey = (key:string) => `group:${key}`;
const buildKey = (id:string, property:string) => `build:${id}:${property}`;
const notesKey = (id:string, locale:string) => buildKey(id, `notes:${locale}`);
const pick = (attributes:Attributes, keys:string[]):Attributes => Object.fromEntries(keys.map(key => [key, attributes[key] ?? null]));
const diff = (desired:Attributes, current:Attributes):Attributes => Object.fromEntries(Object.entries(desired).filter(([key, value]) => value !== current[key]));
const asGroup = (snapshot:Snapshot, key:string) => snapshot.remote[groupKey(key)] as BetaGroup | null;

async function validate(selection:Selection, roots:readonly string[], env:NodeJS.ProcessEnv, signal?:AbortSignal) {
  const result = await validateRepository(selection, roots, env, signal);
  if (!result.valid) {
    const errors = result.diagnostics.filter(item => item.severity === 'error').slice(0, 12)
      .map(({path, field, rule}) => [path, field, rule].filter(Boolean).join(' '));
    throw new AppStoreError('invalidRepository', `Resolve selected TestFlight inputs: ${errors.join(', ')}.`);
  }
  return result;
}

async function context(selection:Selection, roots:readonly string[], env:NodeJS.ProcessEnv, api:TestFlightApi, identity:()=>string, signal?:AbortSignal) {
  const local = await validate(selection, roots, env, signal);
  const app = appManifest(local)!;
  const appId = app.app.appStoreId;
  const bundleId = app.app.bundleId;
  if (!appId) throw new AppStoreError('appSelectionRequired', 'TestFlight requires an exact App Store app ID and bundle ID in app.json.');
  const credentialContext = identity();
  await api.app(appId, bundleId, signal);
  return {root:local.root, local, appId, bundleId, app, credentialContext};
}

function selectedGroup(desired:Record<string,unknown>, key:string):TestFlightGroup {
  const manifest = desired['testflight/groups.json'] as Manifest | undefined;
  const group = manifest && Object.hasOwn(manifest.groups, key) ? manifest.groups[key] : undefined;
  if (!group) throw new AppStoreError('unknownBetaGroup', 'Select an explicitly declared group key in testflight/groups.json.');
  return group;
}

function requireGroup(group:BetaGroup | null):BetaGroup {
  if (!group) throw new AppStoreError('betaGroupMissing', 'Create the selected external group through an approved configuration plan first.');
  return group;
}

function attributeValues(value:unknown, environment:NodeJS.ProcessEnv):Attributes {
  return Object.fromEntries(Object.entries((value ?? {}) as Record<string,string | boolean | {env:string}>)
    .map(([field, entry]) => [field, typeof entry === 'object' ? environment[entry.env]! : entry]));
}

function localized(entries:Resource[], locale:string, wanted:Attributes):ManagedResource | null {
  if (entries.some(entry => typeof entry.attributes.locale !== 'string')) {
    throw new AppStoreError('incompleteSnapshot', 'Apple omitted the locale of a TestFlight localization.');
  }
  const matches = entries.filter(item => item.attributes.locale === locale);
  if (matches.length > 1) throw new AppStoreError('ambiguousBetaLocalization', 'Multiple Apple resources match a selected TestFlight locale.');
  const entry = matches[0];
  return entry ? {id:entry.id, attributes:pick(entry.attributes, Object.keys(wanted))} : null;
}

function change(domain:string, key:string, scope:string, kind:Operation['kind'], write:Write, before?:Json, after?:Json, options?:{sensitive?:boolean; affects?:string[]; dependencies?:string[]}):Operation {
  return {
    id:`op-${createHash('sha256').update(canonical([domain, scope, key])).digest('hex').slice(0, 24)}`,
    domain, key, scope, kind, before:before ?? null, after:after ?? null, payload:write,
    affects:[key, ...(options?.affects ?? [])], dependencies:options?.dependencies ?? [], sensitive:options?.sensitive ?? false,
  };
}

type BetaSnapshot = Snapshot & { desired:Record<string,Attributes> };

abstract class TestFlightAdapter implements Adapter {
  abstract readonly domain:string;
  constructor(protected readonly api:TestFlightApi) {}
  abstract capture(signal?:AbortSignal):Promise<BetaSnapshot>;
  abstract propose(snapshot:BetaSnapshot):Operation[];
  abstract summary(snapshot:BetaSnapshot):Json;

  protected write(operation:Readonly<Operation>):Write { return operation.payload as Write; }

  async execute(operation:Readonly<Operation>, signal?:AbortSignal):Promise<void> {
    const write = this.write(operation);
    switch (write.action) {
      case 'createGroup': return this.api.createGroup(write.appId, write.name, signal);
      case 'publicLink': return this.api.publicLink(write.id, write.attributes, signal);
      case 'localize': return this.api.localize(write.parent, write.locale, write.id, write.attributes, signal);
      case 'review': return this.api.updateReviewDetail(write.id, write.attributes, signal);
      case 'autoNotify': return this.api.autoNotify(write.id, write.value, signal);
      case 'attach': return this.api.attach(write.groupId, write.buildId, signal);
      case 'submit': return this.api.submit(write.buildId, signal);
      case 'notify': return this.api.notify(write.buildId, signal);
    }
  }

  verify(operation:Readonly<Operation>, snapshot:Snapshot):boolean {
    const write = this.write(operation);
    const value = snapshot.remote[operation.key];
    switch (write.action) {
      case 'createGroup': {
        const group = value as BetaGroup | null;
        return !!group && group.name === write.name && !group.publicLinkEnabled;
      }
      case 'publicLink': {
        const group = value as BetaGroup;
        const desired = (snapshot as BetaSnapshot).desired.publicLink!;
        return group.id === write.id && canonical(pick(group, Object.keys(desired))) === canonical(desired);
      }
      case 'localize':
      case 'review': {
        const remote = value as ManagedResource | null;
        return !!remote && (!write.id || remote.id === write.id)
          && canonical(remote.attributes) === canonical(operation.sensitive ? (snapshot as BetaSnapshot).desired[operation.key] : operation.after);
      }
      case 'autoNotify': {
        const detail = value as BuildDetail;
        return detail.id === write.id && detail.autoNotifyEnabled === write.value;
      }
      case 'attach': return value === true && asGroup(snapshot, snapshot.target.groupKey!)?.id === write.groupId;
      case 'submit': return ['WAITING_FOR_REVIEW','IN_REVIEW','APPROVED','REJECTED'].includes((value as BetaBuild['review'])?.state ?? '');
      case 'notify': return value === 'IN_BETA_TESTING';
    }
  }

  remoteIds(operation:Readonly<Operation>, snapshot:Snapshot):string[] {
    const write = this.write(operation);
    const value = snapshot.remote[operation.key];
    if (write.action === 'notify') return [write.buildId];
    if (write.action === 'attach') return [write.groupId, write.buildId];
    return value && typeof value === 'object' && 'id' in value ? [value.id as string] : [];
  }

  protected localization(snapshot:BetaSnapshot, key:string, parent:{type:'apps'|'builds'; id:string}, locale:string):Operation[] {
    const desired = snapshot.desired[key]!;
    const current = snapshot.remote[key] as ManagedResource | null;
    const attributes = diff(desired, current?.attributes ?? {});
    if (!Object.keys(attributes).length) return [];
    return [change(this.domain, key, `${parent.id}/${locale}`, current ? 'update' : 'create',
      {action:'localize', parent, locale, id:current?.id ?? null, attributes}, current?.attributes, desired,
      {sensitive:Object.hasOwn(desired,'feedbackEmail')})];
  }
}

export class TestFlightConfigurationAdapter extends TestFlightAdapter {
  readonly domain = 'testflightConfiguration';
  constructor(private readonly selection:ConfigurationSelection, private readonly roots:readonly string[],
    api:TestFlightApi, private readonly identity:()=>string) { super(api); }

  async capture(signal?:AbortSignal):Promise<BetaSnapshot> {
    const {root, groups, locales, review} = this.selection;
    const env = {...process.env};
    const domains:NonNullable<Selection['domains']> = [
      ...(groups ? ['testflightGroups'] as const : []),
      ...(locales ? ['testflightLocalizations'] as const : []),
      ...(review ? ['testflightReview'] as const : []),
    ];
    const contextValue = await context({root, domains, ...(locales ? {locales} : {})}, this.roots, env, this.api, this.identity, signal);
    const {local, appId, bundleId, credentialContext} = contextValue;
    const remote:Snapshot['remote'] = {};
    const desired:BetaSnapshot['desired'] = {};
    if (groups) {
      const declarations = groups.map(key => [key, selectedGroup(local.desired,key)] as const);
      const inventory = await this.api.groups(appId, signal);
      remote.internalGroupExists = inventory.some(group => group.attributes.isInternalGroup === true);
      for (const [key, declared] of declarations) {
        remote[groupKey(key)] = await this.api.group(appId, declared, inventory, signal);
        desired[groupKey(key)] = {name:declared.name};
      }
    }
    if (locales) {
      const entries = await this.api.appLocalizations(appId, signal);
      for (const locale of locales) {
        const key = `appLocale:${locale}`;
        desired[key] = attributeValues(local.desired[`testflight/localizations/${locale}.json`], env);
        remote[key] = localized(entries, locale, desired[key]);
      }
    }
    if (review) {
      const notes = local.desired['testflight/review-notes.txt'];
      desired.review = {...attributeValues(local.desired['testflight/review.json'], env), ...(typeof notes === 'string' ? {notes} : {})};
      const entry = await this.api.reviewDetail(appId, signal);
      remote.review = {id:entry.id, attributes:pick(entry.attributes, Object.keys(desired.review))};
    }
    return {root:contextValue.root, target:{appId,bundleId}, credentialContext,
      inputs:local.hashes, secretFingerprint:local.secretFingerprint, rulesVersion, desired, remote};
  }

  propose(snapshot:BetaSnapshot):Operation[] {
    const {appId} = snapshot.target as {appId:string};
    const operations:Operation[] = [];
    for (const key of this.selection.groups ?? []) {
      if (asGroup(snapshot, key)) continue;
      if (snapshot.remote.internalGroupExists !== true) {
        throw new AppStoreError('internalBetaGroupRequired', 'Create an internal TestFlight group in App Store Connect before creating an external group.');
      }
      const name = snapshot.desired[groupKey(key)]!.name as string;
      operations.push(change(this.domain, groupKey(key), appId, 'create', {action:'createGroup',appId,name},
        null, {name, isInternalGroup:false, publicLinkEnabled:false}));
    }
    for (const locale of this.selection.locales ?? []) {
      operations.push(...this.localization(snapshot, `appLocale:${locale}`, {type:'apps', id:appId}, locale));
    }
    if (this.selection.review) {
      const current = snapshot.remote.review as ManagedResource;
      const attributes = diff(snapshot.desired.review!, current.attributes);
      if (Object.keys(attributes).length) operations.push(change(this.domain, 'review', appId, 'update',
        {action:'review',id:current.id,attributes}, current.attributes, snapshot.desired.review, {sensitive:true}));
    }
    return operations;
  }

  summary(snapshot:BetaSnapshot):Json {
    return {groups:(this.selection.groups ?? []).map(key => ({key, existing:asGroup(snapshot,key)})),
      internalGroupExists:snapshot.remote.internalGroupExists ?? null,
      locales:this.selection.locales ?? [], review:!!this.selection.review};
  }
}

function eligibility(build:BuildIdentity, externalState:BetaBuild['externalState']):string[] {
  const blockers:string[] = [];
  if (build.processingState !== 'VALID') blockers.push('buildNotValid');
  if (build.audience !== 'APP_STORE_ELIGIBLE') blockers.push('internalOnlyBuild');
  if (build.expired || externalState === 'EXPIRED') blockers.push('buildExpired');
  if (build.usesNonExemptEncryption === null || (build.usesNonExemptEncryption && build.encryptionDeclarationState !== 'APPROVED')
    || ['MISSING_EXPORT_COMPLIANCE','IN_EXPORT_COMPLIANCE_REVIEW'].includes(externalState)) blockers.push('exportComplianceUnresolved');
  if (!ready.has(externalState)) blockers.push('externalStateBlocksDistribution');
  return blockers;
}

function requireEligible(build:BetaBuild):void {
  const blockers = eligibility(build.identity, build.externalState);
  if (build.review?.state === 'REJECTED') blockers.push('betaReviewRejected');
  if (blockers.length) throw new AppStoreError('betaBuildBlocked', `Build ${build.identity.id} is blocked: ${blockers.join(', ')}.`);
}

function betaObservation(build:BetaBuild, member:boolean | null):Json {
  const {identity, externalState, review, autoNotifyEnabled} = build;
  const blockers = eligibility(identity, externalState);
  if (review?.state === 'REJECTED') blockers.push('betaReviewRejected');
  if (member === false) blockers.push('buildNotInSelectedGroup');
  const waitingForReview = externalState === 'WAITING_FOR_BETA_REVIEW' || externalState === 'IN_BETA_REVIEW'
    || review?.state === 'WAITING_FOR_REVIEW' || review?.state === 'IN_REVIEW';
  if (waitingForReview) blockers.push('waitingForBetaReview');
  if (externalState === 'READY_FOR_BETA_SUBMISSION' && !review) blockers.push('betaReviewSubmissionRequired');
  if (externalState === 'BETA_APPROVED' || externalState === 'READY_FOR_BETA_TESTING') blockers.push('externalTestingNotActive');
  return {...identity, externalState, review, inSelectedGroup:member, autoNotifyEnabled, waitingForReview,
    readyForTesters:member === true && externalState === 'IN_BETA_TESTING' && blockers.length === 0, blockers};
}

export class TestFlightDistributionAdapter extends TestFlightAdapter {
  readonly domain = 'testflightDistribution';
  readonly #builds:BuildSelection[];
  constructor(private readonly selection:DistributionSelection, private readonly roots:readonly string[],
    api:TestFlightApi, private readonly identity:()=>string) {
    super(api);
    this.#builds = selection.action === 'attach' ? selection.builds : selection.action === 'publicLink' ? [] : [selection.build];
  }

  async capture(signal?:AbortSignal):Promise<BetaSnapshot> {
    const {root, groupKey:key, action} = this.selection;
    const env = {...process.env};
    const {root:canonicalRoot, appId, bundleId, local, app, credentialContext} = await context(
      {root, domains:['testflightGroups']}, this.roots, env, this.api, this.identity, signal);
    const declared = selectedGroup(local.desired, key);
    const inventory = await this.api.groups(appId, signal);
    const group = requireGroup(await this.api.group(appId, declared, inventory, signal));
    const remote:Snapshot['remote'] = {[groupKey(key)]:group};
    const desired:BetaSnapshot['desired'] = {};
    const inputs = {...local.hashes};
    const snapshot = {root:canonicalRoot, target:{appId,bundleId,groupKey:key,groupId:group.id,action}, credentialContext,
      inputs, secretFingerprint:local.secretFingerprint, rulesVersion, desired, remote};

    if (action === 'publicLink') {
      const policy = declared.publicLink;
      if (!policy) throw new AppStoreError('publicLinkUnmanaged', 'Declare an explicit public link policy for the selected group.');
      desired.publicLink = {publicLinkEnabled:policy.enabled,
        ...(policy.testerLimit === undefined ? {} : {publicLinkLimitEnabled:true, publicLinkLimit:policy.testerLimit})};
      if (policy.enabled) remote.assignedBuilds = await this.api.members(group.id, signal);
      return snapshot;
    }

    const members = await this.api.members(group.id, signal);
    const locales = action === 'attach' ? this.selection.locales : undefined;
    for (const item of this.#builds) {
      if (!app.platforms.includes(item.platform)) throw new AppStoreError('wrongBuildPlatform', 'The selected platform must be declared in app.json.');
      const build = await this.api.build(appId, item.buildId, item.platform, signal);
      const {identity, detailId, autoNotifyEnabled, externalState, review} = build;
      const id = identity.id;
      remote[buildKey(id,'identity')] = identity;
      remote[buildKey(id,'detail')] = {id:detailId, autoNotifyEnabled};
      remote[buildKey(id,'external')] = externalState;
      remote[buildKey(id,'review')] = review;
      remote[buildKey(id,'membership')] = members.includes(id);
      if (item.autoNotifyEnabled !== undefined) desired[buildKey(id,'detail')] = {autoNotifyEnabled:item.autoNotifyEnabled};
      if (locales) {
        const platform = (Object.keys(platforms) as (keyof typeof platforms)[]).find(key => platforms[key] === identity.platform)!;
        const notes = await validate({root:canonicalRoot, domains:['testflightBuildNotes'], platform, version:identity.version, locales}, this.roots, env, signal);
        if (notes.root !== canonicalRoot) throw new AppStoreError('inputChanged', 'The selected AppStore root changed during capture.');
        for (const [path, hash] of Object.entries(notes.hashes)) {
          if (inputs[path] && inputs[path] !== hash) throw new AppStoreError('inputChanged', 'Selected TestFlight inputs changed during capture.');
          inputs[path] = hash;
        }
        const existing = await this.api.buildLocalizations(id, signal);
        for (const locale of locales) {
          const name = notesKey(id, locale);
          const text = notes.desired[`testflight/build-notes/${platform}/${identity.version}/${locale}.txt`] as string;
          desired[name] = {whatsNew:text};
          remote[name] = localized(existing, locale, desired[name]);
        }
      }
    }
    return snapshot;
  }

  #build(snapshot:Snapshot, id:string):BetaBuild {
    const detail = snapshot.remote[buildKey(id,'detail')] as BuildDetail;
    return {identity:snapshot.remote[buildKey(id,'identity')] as BuildIdentity,
      autoNotifyEnabled:detail.autoNotifyEnabled, detailId:detail.id,
      externalState:snapshot.remote[buildKey(id,'external')] as BetaBuild['externalState'],
      review:snapshot.remote[buildKey(id,'review')] as BetaBuild['review']};
  }

  checkOperation(operation:Readonly<Operation>, snapshot:Snapshot):void {
    const write = this.write(operation);
    // Auto-notify can change Apple's external state before the dependent attachment.
    if (write.action === 'attach') requireEligible(this.#build(snapshot, write.buildId));
  }

  propose(snapshot:BetaSnapshot):Operation[] {
    const {action, groupKey:key} = this.selection;
    const group = asGroup(snapshot, key)!;
    if (action === 'publicLink') {
      const attributes = diff(snapshot.desired.publicLink!, group);
      return Object.keys(attributes).length ? [change(this.domain, groupKey(key), group.id, 'update',
        {action:'publicLink',id:group.id,attributes}, group, {...group,...attributes})] : [];
    }
    return this.#builds.flatMap(item => {
      const id = item.buildId;
      const build = this.#build(snapshot,id);
      requireEligible(build);
      const membership = buildKey(id,'membership');
      const external = buildKey(id,'external');
      const review = buildKey(id,'review');
      const member = snapshot.remote[membership] === true;
      const detail = buildKey(id,'detail');
      if (action === 'attach') {
        const operations = (this.selection.locales ?? []).flatMap(locale =>
          this.localization(snapshot, notesKey(id,locale), {type:'builds',id}, locale));
        if (item.autoNotifyEnabled !== undefined && build.autoNotifyEnabled !== item.autoNotifyEnabled) {
          operations.push(change(this.domain, detail, id, 'update',
            {action:'autoNotify',id:build.detailId,value:item.autoNotifyEnabled}, build.autoNotifyEnabled, item.autoNotifyEnabled,
            {affects:[external, review]}));
        }
        if (!member) operations.push(change(this.domain, membership, `${group.id}/${id}`, 'create',
          {action:'attach',groupId:group.id,buildId:id}, false, true,
          {affects:[external, review], dependencies:operations.map(op => op.id)}));
        return operations;
      }
      if (!member) throw new AppStoreError('betaBuildMembershipRequired', 'Attach the exact build to the selected external group before submitting or notifying.');
      if (action === 'submit') {
        if (build.review || build.externalState !== 'READY_FOR_BETA_SUBMISSION') return [];
        return [change(this.domain, review, id, 'create', {action:'submit',buildId:id}, null, 'submitExactBuild', {affects:[external]})];
      }
      if (build.externalState === 'IN_BETA_TESTING') return [];
      if (build.review?.state !== 'APPROVED' || !['BETA_APPROVED','READY_FOR_BETA_TESTING'].includes(build.externalState)
        || build.autoNotifyEnabled !== false) {
        throw new AppStoreError('betaNotificationBlocked', 'Manual notification requires an approved build awaiting distribution with auto-notify explicitly off.');
      }
      return [change(this.domain, external, id, 'create', {action:'notify',buildId:id}, build.externalState, 'IN_BETA_TESTING')];
    });
  }

  summary(snapshot:BetaSnapshot):Json {
    const group = asGroup(snapshot, this.selection.groupKey);
    const assigned = snapshot.remote.assignedBuilds;
    return {action:this.selection.action, group,
      ...(Array.isArray(assigned) ? {assignedBuildCount:assigned.length, publicEnrollmentScope:'All installable builds assigned to this group'} : {}),
      ...(this.selection.action !== 'publicLink' ? {notificationScope:'All assigned testers of the exact build',
        builds:this.#builds.map(item => betaObservation(this.#build(snapshot,item.buildId), snapshot.remote[buildKey(item.buildId,'membership')] === true))} : {}),
    };
  }
}

export class TestFlightReader {
  constructor(private readonly roots:readonly string[], private readonly api:TestFlightApi, private readonly identity:()=>string) {}

  async state(selection:StateSelection, signal?:AbortSignal) {
    const {root, groupKey:key, builds = []} = selection;
    const {appId, bundleId, local, app} = await context(
      {root, domains:key ? ['testflightGroups'] : []}, this.roots, process.env, this.api, this.identity, signal);
    const inventory = await this.api.groups(appId, signal);
    const group = key ? await this.api.group(appId, selectedGroup(local.desired,key), inventory, signal) : null;
    const members = group && builds.length ? await this.api.members(group.id, signal) : null;
    const selected = [];
    for (const item of builds) {
      if (!app.platforms.includes(item.platform)) throw new AppStoreError('wrongBuildPlatform', 'The selected platform must be declared in app.json.');
      const build = await this.api.build(appId, item.buildId, item.platform, signal);
      selected.push(betaObservation(build, members?.includes(item.buildId) ?? (key ? false : null)));
    }
    return {appId, bundleId, groupKey:key ?? null, group, internalGroupExists:inventory.some(group => group.attributes.isInternalGroup === true), builds:selected};
  }

  async joinLink(selection:z.infer<typeof testflightGroupSelection>, signal?:AbortSignal) {
    const {appId, group} = await this.state(selection, signal);
    const exact = requireGroup(group);
    const joinLink = await this.api.joinLink(appId, exact, signal);
    return {appId, groupId:exact.id, publicLinkEnabled:joinLink !== null, joinLink};
  }
}
