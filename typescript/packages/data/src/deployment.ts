import { Db, DbReader, syncSchema } from './db.js';
import { Scheduler, syncJobs, type ScheduledJob } from './scheduler.js';
import type { Schema } from './schema.js';
import type { DataStorage } from './storage.js';

// ---------------------------------------------------------------------------- functions

export type QueryCtx<S extends Schema> = { db: DbReader<S>; env: any; now: number };
export type MutationCtx<S extends Schema> = { db: Db<S>; scheduler: Scheduler; env: any; now: number };

type QueryFn<A = any, R = any> = { readonly kind: 'query'; readonly run: (ctx: QueryCtx<any>, args: A) => R };
type MutationFn<A = any, R = any> = { readonly kind: 'mutation'; readonly run: (ctx: MutationCtx<any>, args: A) => R };
export type AnyFn = QueryFn | MutationFn;

/** Handed to the `functions` builder. Functions are synchronous: SQLite in a Durable Object is. */
export type FunctionBuilders<S extends Schema> = {
  query: <A = void, R = unknown>(run: (ctx: QueryCtx<S>, args: A) => R) => QueryFn<A, R>;
  mutation: <A = void, R = unknown>(run: (ctx: MutationCtx<S>, args: A) => R) => MutationFn<A, R>;
};

type Names<F, K> = { [N in keyof F]: F[N] extends { kind: K } ? N : never }[keyof F] & string;
type ArgsOf<T> = T extends { run: (ctx: any, args: infer A) => any } ? A : never;
type ReturnOf<T> = T extends { run: (ctx: any, args: any) => infer R } ? Awaited<R> : never;
type Call<T> = [ArgsOf<T>] extends [void] ? () => Promise<ReturnOf<T>> : (args: ArgsOf<T>) => Promise<ReturnOf<T>>;

export type DataClient<F> = {
  query: { [N in Names<F, 'query'>]: Call<F[N]> };
  mutate: { [N in Names<F, 'mutation'>]: Call<F[N]> };
  /** Looks a scheduled job up from outside a mutation. */
  job(id: string): Promise<ScheduledJob | null>;
};

// ---------------------------------------------------------------------------- jobs

export type JobCtx<F> = {
  env: any;
  id: string;
  /** 1 on the first try. */
  attempt: number;
  /** Runs one of the data functions in this object, the same way a procedure would. */
  data: DataClient<F>;
};
/** `concurrent`: a job that runs long or waits on others, so it doesn't hold up the rest. By default jobs run one at a time. */
export type JobOptions = { concurrent?: boolean };
export type JobFn<F = any, A = any> = (ctx: JobCtx<F>, args: A) => void | Promise<void>;

// ---------------------------------------------------------------------------- definition

export type DataDefinition<S extends Schema, F extends Record<string, AnyFn>, J extends Record<string, JobFn<F>>> = {
  schema: S;
  functions: (fn: FunctionBuilders<S>) => F;
  /** Handlers for `scheduler.runAfter(ms, name, args)`. They may be async and call other services. */
  jobs?: (job: <A = void>(run: JobFn<F, A>, options?: JobOptions) => JobFn<F, A>) => J;
  /**
   * Called after a mutation commits, with the topics it touched (`table`, `table:id`, plus
   * table `topics`). Publish them to your live transport here. The mutation answers without
   * waiting for it: publishing can mean a round trip per topic and per listener, and the
   * caller shouldn't wait on the slowest one. A Durable Object keeps running the work after it
   * answers. Errors are logged, never thrown: live delivery is at most once, so clients
   * refetch on reconnect anyway.
   */
  onCommit?: (topics: string[], env: any) => void | Promise<void>;
  /** Attempts per job before it is parked as failed. Default 5. */
  maxJobAttempts?: number;
  /** How long a plain job may hold the one-at-a-time lane before the next one starts beside it. Default 120000 (two minutes). */
  laneMs?: number;
};

type Stub = { run(kind: string, name: string, args: unknown): Promise<any>; job(id: string): Promise<ScheduledJob | null> };
type Namespace = { idFromName(name: string): unknown; get(id: any): any };

export type Data<S extends Schema, F extends Record<string, AnyFn>, _J extends Record<string, JobFn<F>>> = {
  readonly schema: S;
  readonly functions: F;
  /**
   * Mixes the data layer into a Durable Object class:
   * `export class Deployment extends data.durableObject(DurableObject) {}`
   * with `DurableObject` from "cloudflare:workers". Bind it and run a migration for it
   * like any SQLite-backed Durable Object.
   */
  durableObject<B extends abstract new (...args: any[]) => object>(Base: B): new (...args: ConstructorParameters<B>) => InstanceType<B> & DataObject;
  /** A typed client for the one object that holds the deployment's data. */
  client(namespace: Namespace, name?: string): DataClient<F>;
  /** For tests and in-process use: run against any storage that satisfies `DataStorage`. */
  engine(storage: DataStorage, env?: unknown): Engine;
};

export interface DataObject {
  run(kind: 'query' | 'mutation', name: string, args: unknown): Promise<unknown>;
  job(id: string): Promise<ScheduledJob | null>;
  alarm(): Promise<void>;
}

export function defineData<S extends Schema, F extends Record<string, AnyFn>, J extends Record<string, JobFn<F>> = {}>(
  def: DataDefinition<S, F, J>,
): Data<S, F, J> {
  const functions = def.functions({ query: (run) => ({ kind: 'query', run }) as any, mutation: (run) => ({ kind: 'mutation', run }) as any });
  const jobs = def.jobs?.((run, options) => (options?.concurrent ? Object.assign((ctx: any, args: any) => run(ctx, args), { concurrent: true }) : run)) ?? ({} as J);
  const resolved = { ...def, functions, jobs };
  const engine = (storage: DataStorage, env: unknown = {}) => new Engine(storage, env, resolved as any);

  return {
    schema: def.schema,
    functions,
    engine,
    durableObject(Base) {
      return class extends (Base as unknown as new (...args: any[]) => object) {
        #engine: Engine;
        constructor(...args: any[]) {
          super(...args);
          const [ctx, env] = args as [{ storage: DataStorage; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }, unknown];
          this.#engine = engine(ctx.storage, env);
          // Schema sync is synchronous, but block anyway so no request sees a half-built table.
          void ctx.blockConcurrencyWhile(async () => {
            this.#engine.init();
            await this.#engine.rearm();
          });
        }
        run(kind: 'query' | 'mutation', name: string, args: unknown) {
          return this.#engine.run(kind, name, args);
        }
        job(id: string) {
          return Promise.resolve(this.#engine.scheduler().get(id));
        }
        alarm() {
          return this.#engine.alarm();
        }
      } as any;
    },
    client(namespace, name = 'main') {
      const stub = (): Stub => namespace.get(namespace.idFromName(name));
      const group = (kind: 'query' | 'mutation') =>
        new Proxy({}, { get: (_, fn) => (typeof fn === 'string' ? (args?: unknown) => stub().run(kind, fn, args) : undefined) });
      return { query: group('query'), mutate: group('mutation'), job: (id: string) => stub().job(id) } as DataClient<F>;
    },
  };
}

// ---------------------------------------------------------------------------- engine

type Resolved = {
  schema: Schema;
  functions: Record<string, AnyFn>;
  jobs: Record<string, JobFn<any>>;
  onCommit?: (topics: string[], env: any) => void | Promise<void>;
  maxJobAttempts?: number;
  laneMs?: number;
};

/** Runs data functions and jobs against one storage. The Durable Object mixin wraps this. */
export class Engine {
  constructor(
    private readonly storage: DataStorage,
    private readonly env: any,
    private readonly def: Resolved,
  ) {}

  init(): void {
    syncSchema(this.storage, this.def.schema);
    syncJobs(this.storage);
  }

  scheduler(): Scheduler {
    return new Scheduler(this.storage, (name) => name in this.def.jobs);
  }

  async run(kind: 'query' | 'mutation', name: string, args: unknown): Promise<unknown> {
    const fn = Object.hasOwn(this.def.functions, name) ? this.def.functions[name] : undefined;
    if (!fn || fn.kind !== kind) throw new Error(`no ${kind} function "${name}"`);
    if (fn.kind === 'query') return fn.run({ db: new DbReader(this.storage, this.def.schema), env: this.env, now: Date.now() }, args);

    const db = new Db(this.storage, this.def.schema);
    const scheduler = this.scheduler();
    // One SQLite transaction: a throw rolls back every write and every scheduled job.
    const result = this.storage.transactionSync(() => fn.run({ db, scheduler, env: this.env, now: Date.now() }, args));
    await this.afterCommit(db.touched, scheduler.changed);
    return result;
  }

  /**
   * Durable Object alarm: runs the due jobs, then arms the alarm for the next one. Jobs run one at a time, except those
   * defined `concurrent` (a bot's turn can take minutes): those start at once and don't hold up the rest. Each job id
   * runs once at a time. The alarm stays up while any job runs, and picks up jobs queued meanwhile.
   */
  async alarm(): Promise<void> {
    const scheduler = this.scheduler();
    const max = this.def.maxJobAttempts ?? 5;
    const running = new Set<string>();
    const active: Promise<void>[] = [];
    // The job holding the one-at-a-time lane. A job that hangs gives the lane up after `laneMs`, so it can't hold up the rest.
    let laneOwner: string | null = null;
    const laneMs = this.def.laneMs ?? 120_000;
    for (;;) {
      for (const job of scheduler.due(Date.now(), 50)) {
        if (running.has(job.id)) continue;
        const concurrent = !!(this.def.jobs[job.name] as { concurrent?: boolean } | undefined)?.concurrent;
        if (!concurrent && laneOwner !== null) continue;
        let release: ReturnType<typeof setTimeout> | undefined;
        if (!concurrent) {
          laneOwner = job.id;
          release = setTimeout(() => {
            if (laneOwner === job.id) laneOwner = null;
          }, laneMs);
        }
        running.add(job.id);
        const done = this.runJob(scheduler, job, max).finally(() => {
          running.delete(job.id);
          clearTimeout(release);
          if (laneOwner === job.id) laneOwner = null;
          active.splice(active.indexOf(done), 1);
        });
        active.push(done);
      }
      if (!active.length) break;
      await Promise.race([...active, new Promise((r) => setTimeout(r, 1000))]);
    }
    await this.arm(scheduler);
  }

  private async runJob(scheduler: Scheduler, job: ScheduledJob, max: number): Promise<void> {
    const handler = this.def.jobs[job.name];
    try {
      if (!handler) throw new Error(`no job named "${job.name}"`);
      await handler({ env: this.env, id: job.id, attempt: job.attempts + 1, data: this.dataClient() }, job.args);
      scheduler.done(job);
    } catch (e) {
      console.error(`job ${job.name} (${job.id}) failed`, e);
      scheduler.fail(job, e instanceof Error ? e.message : String(e), max, Date.now());
    }
  }

  /** Arms the alarm for the earliest pending job. A restart can leave jobs pending with no alarm set, so the object calls this when it starts. */
  async rearm(): Promise<void> {
    await this.arm(this.scheduler());
  }

  private dataClient(): DataClient<any> {
    const call = (kind: 'query' | 'mutation') => new Proxy({}, { get: (_, fn) => (typeof fn === 'string' ? (args?: unknown) => this.run(kind, fn, args) : undefined) });
    return { query: call('query'), mutate: call('mutation'), job: async (id: string) => this.scheduler().get(id) } as DataClient<any>;
  }

  private async afterCommit(touched: Set<string>, queueChanged: boolean): Promise<void> {
    if (queueChanged) await this.arm(this.scheduler());
    if (touched.size && this.def.onCommit) {
      const onCommit = this.def.onCommit;
      // Started, not awaited: see `onCommit` in DataDefinition.
      void Promise.resolve()
        .then(() => onCommit([...touched], this.env))
        .catch((e) => console.error('onCommit failed', e));
    }
  }

  private async arm(scheduler: Scheduler): Promise<void> {
    const next = scheduler.nextAt();
    if (next === null) await this.storage.deleteAlarm();
    else await this.storage.setAlarm(next);
  }
}
