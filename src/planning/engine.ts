import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { AppStoreError,type AppleValidationIssue } from '../errors.js';
import { contains } from '../repository/files.js';
import { canonical, freeze, type Snapshot, type Operation, type Adapter } from './model.js';
import { JournalStore } from './journal.js';
export interface Approval {planId:string;digest:string;operationIds:string[];authorization:{confirmedByHost:true}}
export type OperationState='notStarted'|'inFlight'|'confirmed'|'reconciled'|'failed'|'outcomeUnknown';
export interface Entry {id:string;approved:boolean;state:OperationState;beforeHash?:string;afterHash?:string;remoteIds?:string[];validationErrors?:AppleValidationIssue[];code?:string;updatedAt:string}
export interface Journal {planId:string;digest:string;state:'planned'|'running'|'complete'|'partial';operations:Entry[];updatedAt:string}
interface Plan {id:string;digest:string;snapshot:Snapshot;operations:Operation[];createdAt:number;expiresAt:number}
interface RecordState {plan:Plan;adapter:Adapter;store:JournalStore;journal:Journal;consumed:boolean}
export class PlanEngine {
  readonly #secret=randomBytes(32);
  readonly #records=new Map<string,RecordState>();
  readonly #locks=new Set<string>();
  constructor(private readonly allowedRoots:readonly string[],private readonly allowWrites:boolean,private readonly now:()=>number=Date.now){}
  #hash(value:unknown):string{return createHmac('sha256',this.#secret).update(canonical(value)).digest('hex');}
  #stamp():string{return new Date(this.now()).toISOString();}
  #binding(snapshot:Snapshot):unknown{const {remote:_,...binding}=snapshot;return binding;}
  #equal(a:unknown,b:unknown):boolean{return this.#hash(a)===this.#hash(b);}
  #public(plan:Plan,adapter:Adapter):Record<string,unknown>{
    return {...(adapter.summary?{summary:adapter.summary(plan.snapshot)}:{}),planId:plan.id,digest:plan.digest,createdAt:new Date(plan.createdAt).toISOString(),expiresAt:new Date(plan.expiresAt).toISOString(),target:plan.snapshot.target,rulesVersion:plan.snapshot.rulesVersion,
      operations:plan.operations.map(operation=>({id:operation.id,domain:operation.domain,kind:operation.kind,key:operation.key,scope:operation.scope,dependencies:operation.dependencies,sensitive:operation.sensitive,
        before:operation.sensitive?'[redacted]':operation.before,after:operation.sensitive?'[redacted]':operation.after})),noOp:plan.operations.length===0};
  }
  #order(operations:Operation[],domain:string):Operation[]{
    if(operations.length>200)throw new AppStoreError('planTooLarge','Select a smaller operation scope (maximum 200 operations).');
    const ids=new Set(operations.map(operation=>operation.id));
    if(ids.size!==operations.length)throw new AppStoreError('invalidPlan','Duplicate operation identities.');
    for(const operation of operations){
      if(operation.domain!==domain||!/^[A-Za-z0-9:_-]{1,128}$/.test(operation.id)||!['create','update','remove','submission'].includes(operation.kind)||!operation.key||!operation.affects.includes(operation.key)||operation.dependencies.some(id=>!ids.has(id)))throw new AppStoreError('invalidPlan','Unrecognized operation or dependency.');
    }
    const remaining=[...operations];const ordered:Operation[]=[];const seen=new Set<string>();
    while(remaining.length){const index=remaining.findIndex(operation=>operation.dependencies.every(id=>seen.has(id)));if(index<0)throw new AppStoreError('invalidPlan','Cyclic operation dependencies.');const operation=remaining.splice(index,1)[0]!;ordered.push(operation);seen.add(operation.id);}
    return ordered;
  }
  async create(adapter:Adapter,signal?:AbortSignal):Promise<Record<string,unknown>>{
    if(this.#records.size>=100)throw new AppStoreError('planLimit','This process has reached its 100-plan limit; inspect journals and restart before creating more plans.');
    const snapshot=structuredClone(await adapter.capture(signal));
    const root=await realpath(snapshot.root);
    if(root!==snapshot.root||!this.allowedRoots.some(allowed=>contains(allowed,root)))throw new AppStoreError('unsafeRoot','Plan root must be canonical and approved.');
    const operations=this.#order(structuredClone(adapter.propose(freeze(structuredClone(snapshot)))),adapter.domain);
    const id=randomUUID();const createdAt=this.now();const unsigned={id,snapshot,operations,createdAt,expiresAt:createdAt+15*60_000};
    if(Buffer.byteLength(canonical(unsigned))>4_194_304)throw new AppStoreError('planTooLarge','Internal plan exceeds the 4 MiB limit; select a smaller scope.');
    const plan=freeze({...unsigned,digest:this.#hash(unsigned)});
    const journal:Journal={planId:id,digest:plan.digest,state:'planned',operations:operations.map(operation=>({id:operation.id,approved:false,state:'notStarted',updatedAt:this.#stamp()})),updatedAt:this.#stamp()};
    const store=await JournalStore.create(root,this.allowedRoots);
    const publicPlan=this.#public(plan,adapter);const planPath=await store.save(id,'plan',publicPlan);await store.save(id,'journal',journal);
    this.#records.set(id,{plan,adapter,store,journal,consumed:false});
    return {...publicPlan,planPath};
  }
  #record(id:string):RecordState{const record=this.#records.get(id);if(!record)throw new AppStoreError('unknownPlan','Plan is unknown to this server process; create a fresh checked plan.');return record;}
  async #persist(record:RecordState):Promise<void>{record.journal.updatedAt=this.#stamp();await record.store.save(record.plan.id,'journal',record.journal);}
  #matchingDigest(actual:string,expected:string):boolean{return /^[0-9a-f]{64}$/.test(actual)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
  #checkSnapshot(plan:Plan,current:Snapshot,expectedRemote:Snapshot['remote']):void{
    if(!this.#equal(this.#binding(plan.snapshot),this.#binding(current)))throw new AppStoreError('stalePlan','Local inputs, secrets, account, target or rules changed; create a new plan.');
    if(!this.#equal(current.remote,expectedRemote))throw new AppStoreError('stalePlan','Relevant remote state changed; create a new plan.');
  }
  #remoteIds(record:RecordState,operation:Operation,snapshot:Snapshot):string[]{
    const ids=record.adapter.remoteIds?.(operation,snapshot)??[];
    if(ids.length>100||ids.some(id=>!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw new AppStoreError('invalidReceipt','Adapter returned invalid remote identities.');
    return ids;
  }
  #unrelatedChange(before:Snapshot,after:Snapshot,operation:Operation):boolean{
    return [...new Set([...Object.keys(before.remote),...Object.keys(after.remote)])].some(key=>!operation.affects.includes(key)&&!this.#equal(before.remote[key],after.remote[key]));
  }
  async apply(approval:Approval,signal?:AbortSignal):Promise<Journal>{
    if(!this.allowWrites)throw new AppStoreError('readOnly','Restart with the independently authorized write flag before applying.');
    if(approval.authorization?.confirmedByHost!==true)throw new AppStoreError('approvalRequired','The host must authorize the exact operation subset; a digest alone is not consent.');
    const record=this.#record(approval.planId);const {plan,adapter}=record;
    if(!this.#matchingDigest(approval.digest,plan.digest)||this.now()>=plan.expiresAt)throw new AppStoreError('stalePlan','Plan digest or expiry is invalid.');
    if(record.consumed)throw new AppStoreError('planConsumed','This plan has already begun; replan incomplete work from current state.');
    const selected=new Set(approval.operationIds);
    if(selected.size!==approval.operationIds.length||approval.operationIds.some(id=>!plan.operations.some(operation=>operation.id===id)))throw new AppStoreError('invalidApproval','Approval contains unknown or repeated operations.');
    const operations=plan.operations.filter(operation=>selected.has(operation.id));
    for(const operation of operations){
      if(operation.kind==='submission')throw new AppStoreError('submissionForbidden','Ordinary apply cannot submit for review.');
      if(operation.dependencies.some(id=>!selected.has(id)))throw new AppStoreError('missingDependency','Approve the required dependency subset or create a new plan.');
    }
    // Account-wide serialization also covers shared AppInfo and provisioning resources.
    const lock=this.#hash(plan.snapshot.credentialContext);
    if(this.#locks.has(lock))throw new AppStoreError('busy','Another plan for this target is executing.');
    this.#locks.add(lock);
    try{
      let current=await adapter.capture(signal);this.#checkSnapshot(plan,current,plan.snapshot.remote);
      record.consumed=true;record.journal.state='running';for(const entry of record.journal.operations)entry.approved=selected.has(entry.id);await this.#persist(record);
      for(const operation of operations){
        signal?.throwIfAborted();
        const before=await adapter.capture(signal);this.#checkSnapshot(plan,before,current.remote);
        const entry=record.journal.operations.find(item=>item.id===operation.id)!;
        entry.state='inFlight';entry.beforeHash=this.#hash(before.remote);entry.updatedAt=this.#stamp();await this.#persist(record);
        let failure:unknown;
        try{signal?.throwIfAborted();await adapter.execute(operation,signal);}catch(error){failure=error;}
        if(failure instanceof AppStoreError&&failure.executionDisposition!=='outcomeUnknown'){
          entry.state='failed';entry.code=failure.code;if(failure.validationErrors?.length)entry.validationErrors=failure.validationErrors;await this.#persist(record);break;
        }
        let after:Snapshot|undefined;
        try{after=await adapter.capture(signal);}catch{ /* Retain uncertainty; never replay execute. */ }
        if(after&&this.#equal(this.#binding(plan.snapshot),this.#binding(after))&&adapter.verify(operation,after)){
          entry.state=failure?'reconciled':'confirmed';entry.remoteIds=this.#remoteIds(record,operation,after);entry.afterHash=this.#hash(after.remote);entry.updatedAt=this.#stamp();await this.#persist(record);
          if(this.#unrelatedChange(before,after,operation)||!this.#equal(this.#binding(plan.snapshot),this.#binding(after))){entry.code='concurrentChange';await this.#persist(record);break;}
          current=after;
        }else{entry.state='outcomeUnknown';entry.code=failure instanceof AppStoreError?failure.code:'postconditionUnverified';entry.updatedAt=this.#stamp();await this.#persist(record);break;}
      }
      record.journal.state=record.journal.operations.filter(entry=>entry.approved).every(entry=>['confirmed','reconciled'].includes(entry.state)&&!entry.code)?'complete':'partial';
      await this.#persist(record);return structuredClone(record.journal);
    }catch(error){if(record.consumed){record.journal.state='partial';await this.#persist(record);}if(error instanceof AppStoreError)throw error;throw new AppStoreError('executionInterrupted','Execution interrupted; inspect the journal and replan.');}
    finally{this.#locks.delete(lock);}
  }
  async status(id:string,poll=false,signal?:AbortSignal):Promise<Journal>{
    const record=this.#record(id);
    if(poll&&record.journal.state==='partial'){
      const unknown=record.journal.operations.filter(entry=>entry.approved&&['inFlight','outcomeUnknown'].includes(entry.state));
      if(unknown.length){
        const current=await record.adapter.capture(signal);
        if(!this.#equal(this.#binding(record.plan.snapshot),this.#binding(current)))throw new AppStoreError('stalePlan','Reconciliation requires the original input, account and target context.');
        for(const entry of unknown){const operation=record.plan.operations.find(item=>item.id===entry.id)!;if(record.adapter.verify(operation,current)){entry.state='reconciled';delete entry.code;entry.remoteIds=this.#remoteIds(record,operation,current);entry.afterHash=this.#hash(current.remote);entry.updatedAt=this.#stamp();}}
        record.journal.state=record.journal.operations.filter(entry=>entry.approved).every(entry=>['confirmed','reconciled'].includes(entry.state)&&!entry.code)?'complete':'partial';
        await this.#persist(record);
      }
    }
    return structuredClone(record.journal);
  }
}
