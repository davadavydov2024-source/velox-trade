export const INC = Symbol("inc"); export const UNION = Symbol("union");
export const DB: Record<string, Record<string, any>> = {};
let idc = 0;
export const t = {
  reset() { for (const k of Object.keys(DB)) delete DB[k]; },
  seed(col: string, id: string, data: any) { (DB[col] ??= {})[id] = structuredClone(data); },
  get(col: string, id: string) { return DB[col]?.[id]; },
};
function apply(cur: any, patch: any) {
  const out = { ...(cur ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && (v as any).__inc !== undefined) out[k] = (out[k] ?? 0) + (v as any).__inc;
    else if (v && (v as any).__union !== undefined) out[k] = [...new Set([...(out[k] ?? []), (v as any).__union])];
    else out[k] = v;
  }
  return out;
}
class Snap { constructor(public id: string, private d: any, public ref: any) {} get exists() { return this.d !== undefined; } data() { return this.d && structuredClone(this.d); } }
class Ref {
  constructor(public col: string, public id: string) {}
  async get() { return new Snap(this.id, DB[this.col]?.[this.id], this); }
  async set(d: any, o?: any) { (DB[this.col] ??= {})[this.id] = o?.merge ? apply(DB[this.col]?.[this.id], d) : apply({}, d); }
  async delete() { delete DB[this.col]?.[this.id]; }
  async update(d: any) { if (!DB[this.col]?.[this.id]) throw new Error("not-found"); DB[this.col][this.id] = apply(DB[this.col][this.id], d); }
}
class Query { constructor(public col: string, public f: any[] = [], public lim = 1e9) {}
  where(k: string, _o: string, v: any) { return new Query(this.col, [...this.f, [k, v]], this.lim); }
  limit(n: number) { return new Query(this.col, this.f, n); }
  async get() { const docs = Object.entries(DB[this.col] ?? {}).filter(([, d]) => this.f.every(([k, v]) => d[k] === v)).slice(0, this.lim).map(([id, d]) => new Snap(id, d, new Ref(this.col, id))); return { docs, empty: docs.length === 0, size: docs.length }; } }
class Col extends Query { doc(id?: string) { return new Ref(this.col, id ?? "auto" + ++idc); } }
let chain = Promise.resolve();
export const db = {
  collection: (c: string) => new Col(c),
  runTransaction(fn: any) {
    const run = async () => { const writes: (() => Promise<any>)[] = [];
      const tx = { get: (r: any) => r.get(), update: (r: any, d: any) => writes.push(() => r.update(d)), set: (r: any, d: any, o?: any) => writes.push(() => r.set(d, o)), delete: (r: any) => writes.push(() => r.delete()) };
      const res = await fn(tx); for (const w of writes) await w(); return res; };
    const p = chain.then(run); chain = p.then(() => {}, () => {}); return p;
  },
};
export const FieldValue = { increment: (n: number) => ({ __inc: n }), arrayUnion: (v: any) => ({ __union: v }) };
export const adminAuth = () => ({ getUserByEmail: async (e: string) => { const f = Object.entries(DB.users ?? {}).find(([, u]: any) => u.email === e); if (!f) throw new Error('nf'); return { uid: f[0] }; }, createCustomToken: async (uid: string) => 'custom:' + uid, verifyIdToken: async (tok: string) => { if (!tok.startsWith("tok:")) throw new Error("bad"); return { uid: tok.slice(4) }; } });
export const adminDb = () => db;
export const out: any = { tg: [], push: [], mail: [] };
