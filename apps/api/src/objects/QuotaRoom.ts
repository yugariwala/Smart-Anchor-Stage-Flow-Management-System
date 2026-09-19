/**
 * The small shared quota object (§12). Uses the `counters` table only.
 *
 * Application caps are deliberately LOWER than provider quotas and do not guarantee
 * uninterrupted service. A UID cap alone is not Sybil protection — anonymous identity can
 * be recreated — so the project cap is what actually bounds damage.
 */

import { DurableObject } from 'cloudflare:workers';

import { throwApi } from '../http/errors';
import SCHEMA_SQL from '../storage/schema.sql';
import type { Env } from './EventRoom';

/** §12 defaults. */
export const QUOTA_LIMITS = {
  /** AI attempts per project per UTC day. */
  aiProjectDay: 100,
  /** AI attempts per event per UTC day. */
  aiEventDay: 10,
  /** Concurrent generations per event. */
  aiEventInflight: 1,
  /** Demo events created per project per UTC day. */
  eventsProjectDay: 100,
  /** New events per UID per UTC day. */
  eventsUidDay: 2,
} as const;

export const utcDay = (nowIso: string): string => nowIso.slice(0, 10);

/** Next UTC midnight after `nowIso`, as the counter's reset point. */
const nextUtcMidnight = (nowIso: string): string => `${utcDay(nowIso)}T23:59:59Z`;

export class QuotaRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(SCHEMA_SQL);
  }

  /**
   * Reserves one unit against `key`, or throws 429. Reservation happens BEFORE the guarded
   * attempt, including a retry, so a failed attempt still consumes its unit.
   */
  private reserveSync(key: string, limit: number, nowIso: string): void {
    const resetAt = nextUtcMidnight(nowIso);
    const rows = this.ctx.storage.sql
      .exec<{ used: number; reset_at: string }>(
        'SELECT used, reset_at FROM counters WHERE counter_key = ?',
        key,
      )
      .toArray();
    const row = rows[0];
    const expired = row !== undefined && Date.parse(row.reset_at) <= Date.parse(nowIso);
    const used = row === undefined || expired ? 0 : row.used;
    if (used >= limit) {
      throwApi(
        'DEMO_CAPACITY',
        'This demo has reached its daily capacity. Please try again tomorrow.',
      );
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO counters (counter_key, used, reset_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(counter_key) DO UPDATE SET used = ?, reset_at = ?',
      key,
      used + 1,
      resetAt,
      used + 1,
      resetAt,
    );
  }

  /** Admission for `PUT /v1/events/{uuid}`: both caps in one transaction. */
  async admitEventCreation(uid: string, nowIso: string): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.reserveSync(`events:project:${utcDay(nowIso)}`, QUOTA_LIMITS.eventsProjectDay, nowIso);
      this.reserveSync(`events:uid:${uid}:${utcDay(nowIso)}`, QUOTA_LIMITS.eventsUidDay, nowIso);
    });
  }

  /** AI admission and the per-event in-flight lease belong to the Gemini adapter. */
  async admitAiAttempt(_eventId: string, _nowIso: string): Promise<never> {
    throw new Error('not implemented: Milestone 4');
  }

  async releaseAiInflight(_eventId: string): Promise<never> {
    throw new Error('not implemented: Milestone 4');
  }
}
