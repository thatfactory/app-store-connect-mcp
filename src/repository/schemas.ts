import { z } from 'zod';
export const locales = ['en-US', 'de-DE', 'fr-FR', 'ja', 'pt-BR'] as const;
export const platforms = {macOS: 'MAC_OS', iOS: 'IOS', tvOS: 'TV_OS', visionOS: 'VISION_OS'} as const;
export const localeSchema = z.enum(locales);
const platform = z.enum(['MAC_OS','IOS','TV_OS','VISION_OS']);
const relative = z.string().min(1).max(512);
const url = z.string().url().max(2048);
export const versionString = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const bundle = z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/).max(255);
export const appSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.object({appStoreId:z.string().regex(/^[0-9]+$/).optional(),bundleId:bundle,primaryLocale:localeSchema,sku:z.string().min(1).max(100).optional()}).strict(),
  platforms:z.array(platform).min(1).max(4),localizations:z.array(localeSchema).min(1).max(5),
  categories:z.object({primary:z.string().min(1),secondary:z.string().min(1).nullable().optional()}).strict().optional(),
  defaults:z.object({privacyPolicyUrl:url}).strict().optional(),
  project:z.object({path:relative,scheme:z.string().min(1).optional(),target:z.string().min(1).optional(),configuration:z.string().min(1).optional()}).strict().optional(),
}).strict();
export const infoSchema=z.object({name:z.string().min(2).max(30).optional(),subtitle:z.string().max(30).nullable().optional(),privacyPolicyUrl:url.nullable().optional()}).strict();
export const versionSchema=z.object({schemaVersion:z.literal(1),platform,versionString,copyright:z.string().min(1).max(256).optional(),releaseType:z.enum(['MANUAL','AFTER_APPROVAL']).optional(),defaults:z.object({supportUrl:url}).strict().optional()}).strict();
export const metadataSchema=z.object({supportUrl:url.nullable().optional(),marketingUrl:url.nullable().optional()}).strict();
export const reviewEnvironment={contactFirstName:'APPSTORE_REVIEW_FIRST_NAME',contactLastName:'APPSTORE_REVIEW_LAST_NAME',contactPhone:'APPSTORE_REVIEW_PHONE',contactEmail:'APPSTORE_REVIEW_EMAIL',demoAccountName:'APPSTORE_REVIEW_DEMO_USERNAME',demoAccountPassword:'APPSTORE_REVIEW_DEMO_PASSWORD'} as const;
const reference=(name:string)=>z.object({env:z.literal(name)}).strict();
const contact=(name:string)=>z.union([z.string().min(1).max(256),reference(name)]).optional();
export const reviewSchema=z.object({contactFirstName:contact(reviewEnvironment.contactFirstName),contactLastName:contact(reviewEnvironment.contactLastName),contactPhone:contact(reviewEnvironment.contactPhone),contactEmail:contact(reviewEnvironment.contactEmail),demoAccountRequired:z.boolean().optional(),demoAccountName:contact(reviewEnvironment.demoAccountName),demoAccountPassword:reference(reviewEnvironment.demoAccountPassword).optional()}).strict();
export const screenshotSchema=z.object({mode:z.enum(['merge','replace']),sets:z.object({APP_DESKTOP:z.array(relative).max(10).optional()}).strict()}).strict();
export const commerceSchema=z.object({schemaVersion:z.literal(1),price:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('free'),baseTerritory:z.string().regex(/^[A-Z]{3}$/)}).strict(),
  z.object({mode:z.literal('paid'),baseTerritory:z.string().regex(/^[A-Z]{3}$/),customerPrice:z.string().regex(/^(0|[1-9][0-9]*)\.[0-9]{2}$/)}).strict(),
]).optional(),availability:z.object({territories:z.union([z.literal('all'),z.array(z.string().regex(/^[A-Z]{3}$/)).min(1)]),availableInNewTerritories:z.boolean().optional()}).strict().optional()}).strict();
const capability=z.object({capabilityType:z.enum(["ICLOUD","IN_APP_PURCHASE","GAME_CENTER","PUSH_NOTIFICATIONS","WALLET","INTER_APP_AUDIO","MAPS","ASSOCIATED_DOMAINS","PERSONAL_VPN","APP_GROUPS","HEALTHKIT","HOMEKIT","WIRELESS_ACCESSORY_CONFIGURATION","APPLE_PAY","DATA_PROTECTION","SIRIKIT","NETWORK_EXTENSIONS","MULTIPATH","HOT_SPOT","NFC_TAG_READING","CLASSKIT","AUTOFILL_CREDENTIAL_PROVIDER","ACCESS_WIFI_INFORMATION","NETWORK_CUSTOM_PROTOCOL","COREMEDIA_HLS_LOW_LATENCY","SYSTEM_EXTENSION_INSTALL","USER_MANAGEMENT","APPLE_ID_AUTH"]),settings:z.array(z.object({key:z.string(),options:z.array(z.object({key:z.string(),enabled:z.boolean()}).strict())}).strict()).optional()}).strict();
const identifier=z.object({name:z.string().min(1),platform:z.enum(['IOS','MAC_OS','UNIVERSAL']),capabilities:z.array(capability)}).strict();
export const provisioningSchema=z.object({schemaVersion:z.literal(1),primaryBundleId:identifier,additionalBundleIds:z.array(identifier.extend({identifier:bundle})).optional()}).strict();
export const appleId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const testflightGroupKey=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const testflightPlatforms={iOS:'IOS',tvOS:'TV_OS'} as const;
const nonEmpty=(max:number)=>z.string().min(1).max(max).regex(/\S/);
const testflightGroupSchema=z.object({
  name:nonEmpty(256),
  groupId:appleId.optional(),
  publicLink:z.object({enabled:z.boolean(),testerLimit:z.int().min(1).max(10_000).optional()}).strict().optional(),
}).strict();
export const testflightGroupsSchema=z.object({schemaVersion:z.literal(1),groups:z.record(testflightGroupKey,testflightGroupSchema)}).strict();
export type TestFlightGroup=z.infer<typeof testflightGroupSchema>;
export const testflightFeedbackEnvironment='APPSTORE_TESTFLIGHT_FEEDBACK_EMAIL';
export const testflightLocalizationSchema=z.object({
  description:nonEmpty(4000).optional(),
  feedbackEmail:z.union([z.email().max(256),reference(testflightFeedbackEnvironment)]).optional(),
  marketingUrl:url.optional(),
  privacyPolicyUrl:url.optional(),
  tvOsPrivacyPolicy:nonEmpty(4000).optional(),
}).strict();
export const testflightReviewSchema=z.object({
  contactFirstName:reference(reviewEnvironment.contactFirstName).optional(),
  contactLastName:reference(reviewEnvironment.contactLastName).optional(),
  contactPhone:reference(reviewEnvironment.contactPhone).optional(),
  contactEmail:reference(reviewEnvironment.contactEmail).optional(),
  demoAccountRequired:z.boolean().optional(),
  demoAccountName:reference(reviewEnvironment.demoAccountName).optional(),
  demoAccountPassword:reference(reviewEnvironment.demoAccountPassword).optional(),
}).strict();
export const schemas={app:appSchema,info:infoSchema,version:versionSchema,metadata:metadataSchema,review:reviewSchema,screenshots:screenshotSchema,commerce:commerceSchema,provisioning:provisioningSchema,
  'testflight-groups':testflightGroupsSchema,'testflight-localization':testflightLocalizationSchema,'testflight-review':testflightReviewSchema};
export type AppManifest=z.infer<typeof appSchema>;
export const domains=['appInfo','versionMetadata','version','review','screenshots','commerce','provisioning','testflightGroups','testflightLocalizations','testflightReview','testflightBuildNotes'] as const;
export const selectionSchema=z.object({root:z.string().min(1),domains:z.array(z.enum(domains)).max(domains.length).optional(),locales:z.array(localeSchema).min(1).max(5).optional(),platform:z.enum(['macOS','iOS','tvOS','visionOS']).optional(),version:versionString.optional()}).strict();
export type Selection=z.infer<typeof selectionSchema>;
