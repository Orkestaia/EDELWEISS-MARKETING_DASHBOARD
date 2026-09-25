import { randomBytes, randomInt, randomUUID } from "node:crypto";
import stops from "./stops.json";
import { cents, normalizeEmail } from "./security";
import { schema } from "./schema";

export type Row = Record<string, unknown>;
export interface Connection { query<T extends Row = Row>(sql: string, values?: unknown[]): Promise<T[]> }
export interface Database extends Connection { transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T> }
type Customer = Row & { id: string; first_name: string; token: string; email: string };
type Order = Row & { id: string; stamps_awarded: number; ordered_at: Date | string; status: string };
type Reward = Row & { code: string; percent: number; expires_at: Date | string; status: string; redeemed_order_id: string | null; customer_id: string; email: string };
const iso = (date: Date | string) => new Date(date).toISOString();
const publicReward = (r?: Reward) => r ? { code: r.code, percent: r.percent, expiresAt: iso(r.expires_at) } : null;

export class PassportService {
  constructor(private db: Database, private baseUrl: string, private threshold = 4000) {
    if (!Number.isSafeInteger(threshold) || threshold < 0) throw new Error("Invalid DOUBLE_STAMP_THRESHOLD_CENTS");
  }
  async migrate() {
    await this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(hashtextextended('passport-schema-v1',0))");
      for (const statement of schema) await tx.query(statement);
    });
  }
  async expire(tx: Connection = this.db) { await tx.query("update passport_rewards set status='expired' where status='active' and expires_at <= now()"); }
  private async snapshot(tx: Connection, customer: Customer) {
    await tx.query("update passport_rewards set status='expired' where customer_id=$1 and status='active' and expires_at <= now()", [customer.id]);
    const orders = await tx.query<Order>("select * from passport_orders where customer_id=$1 and status='valid' order by ordered_at, created_at, id", [customer.id]);
    const [reward] = await tx.query<Reward>("select * from passport_rewards where customer_id=$1 and status='active'", [customer.id]);
    const total = Math.min(10, orders.reduce((sum, o) => sum + o.stamps_awarded, 0));
    const stamps = orders.flatMap(o => Array.from({ length: o.stamps_awarded }, () => ({ stampedAt: iso(o.ordered_at) }))).slice(0, 10).map((s, i) => ({ n: i + 1, ...s }));
    return { firstName: customer.first_name, stampsOnCard: total, totalStamps: total, cardsCompleted: total === 10 ? 1 : 0, stamps, reward: publicReward(reward), history: orders.slice(-20).reverse().map(o => ({ date: iso(o.ordered_at), stamps: o.stamps_awarded })) };
  }
  async ingest(body: Record<string, unknown>) {
    if (body.customerEmail == null || body.customerEmail === "" || (typeof body.customerEmail === "string" && !normalizeEmail(body.customerEmail))) return { skipped: true, reason: "no_email" };
    if (typeof body.customerEmail !== "string" || !/^[^@]+@[^@]+\.[^@]+$/.test(normalizeEmail(body.customerEmail)) || body.customerEmail.length > 320 || typeof body.orderId !== "string" || !body.orderId.trim() || body.orderId.length > 200) throw new Error("invalid_body");
    const email = normalizeEmail(body.customerEmail);
    const subtotal = cents(body.subtotal), total = cents(body.total);
    const award = subtotal > this.threshold ? 2 : 1;
    const firstName = typeof body.customerName === "string" ? body.customerName.trim().split(/\s+/)[0].slice(0, 100) : "";
    return this.db.transaction(async tx => {
      // All writers take order lock before customer lock. This serializes retries across emails too.
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`passport-order:${body.orderId}`]);
      const [existing] = await tx.query("select customer_id from passport_orders where source='clover-online' and external_order_id=$1", [body.orderId]);
      if (existing) {
        const [customer] = await tx.query<Customer>("select * from passport_customers where id=$1 for update", [existing.customer_id]);
        const state = await this.snapshot(tx, customer);
        return this.ingestResponse(customer, state, 0, false, false, [], true);
      }
      const [customer] = await tx.query<Customer>(`insert into passport_customers(id,email,first_name,token) values($1,$2,$3,$4)
        on conflict(email) do update set first_name=case when excluded.first_name<>'' then excluded.first_name else passport_customers.first_name end, updated_at=now() returning *`, [randomUUID(), email, firstName, randomBytes(32).toString("base64url")]);
      const before = await this.snapshot(tx, customer);
      const orderId = randomUUID();
      await tx.query("insert into passport_orders(id,customer_id,external_order_id,subtotal_cents,total_cents,stamps_awarded) values($1,$2,$3,$4,$5,$6)", [orderId, customer.id, body.orderId, subtotal, total, award]);
      let completed = false;
      if (before.totalStamps < 10 && before.totalStamps + award >= 10) {
        // Lifetime uniqueness is intentional: the owner confirmed one passport, no rollover or reissue.
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let attempt = 0; attempt < 10; attempt++) {
          const code = `SWISS-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
          const inserted = await tx.query("insert into passport_rewards(id,customer_id,code,triggered_by_order_id) values($1,$2,$3,$4) on conflict do nothing returning id", [randomUUID(), customer.id, code, orderId]);
          if (inserted.length) { completed = true; break; }
          const issued = await tx.query("select id from passport_rewards where customer_id=$1", [customer.id]);
          if (issued.length) break;
          if (attempt === 9) throw new Error("reward_code_exhausted");
        }
      }
      const state = await this.snapshot(tx, customer);
      const added = state.totalStamps - before.totalStamps;
      return this.ingestResponse(customer, state, added, award === 2, completed, stops.slice(before.totalStamps, state.totalStamps), false);
    });
  }
  private ingestResponse(customer: Customer, state: Awaited<ReturnType<PassportService["snapshot"]>>, added: number, double: boolean, completed: boolean, latest: typeof stops, duplicate: boolean) {
    const next = stops[state.stampsOnCard];
    return { duplicate, firstName: state.firstName, passportUrl: `${this.baseUrl}/p/${customer.token}`, stampsAdded: added, doubleStamp: double, totalStamps: state.totalStamps, stampsOnCard: state.stampsOnCard, stampsToReward: 10 - state.stampsOnCard, cardCompleted: completed, carryOver: 0, latestStops: latest, nextStop: next ? { n: next.n, name: next.name } : null, cardImageUrl: `${this.baseUrl}/cards/card-${String(state.stampsOnCard).padStart(2, "0")}.jpg`, reward: state.reward };
  }
  async card(token: string) {
    if (!/^[\w-]{43}$/.test(token)) return null;
    return this.db.transaction(async tx => {
      const [customer] = await tx.query<Customer>("select * from passport_customers where token=$1 for update", [token]);
      return customer ? this.snapshot(tx, customer) : null;
    });
  }
  async reward(code: string, email: string, orderId?: string) {
    return this.db.transaction(async tx => {
      const [r] = await tx.query<Reward>("select r.*,c.email from passport_rewards r join passport_customers c on c.id=r.customer_id where r.code=$1 for update of r", [code]);
      if (!r) return { valid: false, reason: "not_found" };
      if (r.email !== normalizeEmail(email)) return { valid: false, reason: "email_mismatch" };
      if (r.status === "redeemed" && orderId && r.redeemed_order_id === orderId) return { valid: true, percent: 15, duplicate: true };
      if (r.status === "active" && new Date(r.expires_at).getTime() <= Date.now()) {
        await tx.query("update passport_rewards set status='expired' where code=$1 and status='active'", [code]); r.status = "expired";
      }
      if (r.status !== "active") return { valid: false, reason: r.status };
      if (!orderId) return { valid: true, percent: 15 };
      const rows = await tx.query("update passport_rewards set status='redeemed',redeemed_at=now(),redeemed_order_id=$2 where code=$1 and status='active' and expires_at>now() returning id", [code, orderId]);
      return rows.length ? { valid: true, percent: 15, duplicate: false } : { valid: false, reason: "expired" };
    });
  }
  async voidOrder(id: string, reason: string) {
    return this.db.transaction(async tx => {
      const [order] = await tx.query("select customer_id from passport_orders where id=$1", [id]);
      if (!order) return false;
      const [customer] = await tx.query<Customer>("select * from passport_customers where id=$1 for update", [order.customer_id]);
      await tx.query("update passport_orders set status='voided',void_reason=$2 where id=$1 and status='valid'", [id, reason]);
      const state = await this.snapshot(tx, customer);
      if (state.totalStamps < 10) await tx.query("update passport_rewards set status='revoked' where customer_id=$1 and status in ('active','expired')", [customer.id]);
      return true;
    });
  }
  async admin() {
    await this.expire();
    const customers = await this.db.query(`select c.id,c.email,c.first_name,c.token,
      count(o.id)::int as orders, least(10,coalesce(sum(o.stamps_awarded),0))::int as stamps,
      max(o.ordered_at) as last_order, r.code, r.expires_at
      from passport_customers c left join passport_orders o on o.customer_id=c.id and o.status='valid'
      left join passport_rewards r on r.customer_id=c.id and r.status='active'
      group by c.id,r.code,r.expires_at order by (least(10,coalesce(sum(o.stamps_awarded),0))<10) desc, stamps desc`);
    const rewards = await this.db.query("select status,count(*)::int as count from passport_rewards group by status");
    const [days] = await this.db.query("select avg(extract(epoch from (ordered_at-previous))/86400) as days from (select ordered_at,lag(ordered_at) over(partition by customer_id order by ordered_at) as previous from passport_orders where status='valid') t");
    return { customers, rewards, averageDays: days?.days == null ? null : Number(days.days), publicBaseUrl: this.baseUrl };
  }
  async detail(id: string) {
    await this.expire();
    const orders = await this.db.query("select * from passport_orders where customer_id=$1 order by ordered_at desc", [id]);
    const rewards = await this.db.query("select * from passport_rewards where customer_id=$1 order by issued_at desc", [id]);
    return { orders, rewards };
  }
}
