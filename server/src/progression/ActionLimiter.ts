import { ACTION, actionRefill } from '@jjk/shared';

interface Bucket {
  tokens: number;
  at: number;
}

/**
 * ONE rate limit for every action a player takes - training punches, blows at
 * walls and blows at players share it - so an auto-clicker, a macro or a
 * forged client gains nothing past the honest click rate, and cannot train and
 * smash at full rate at once. A bucket of `ACTION.burst` actions, refilled one
 * per `actionRefill(punchRate)` - the Punch Rate upgrade, read off the
 * server's own state, quickens it.
 */
export class ActionLimiter {
  private readonly buckets = new Map<string, Bucket>();

  take(sessionId: string, punchRateLevel: number, now = Date.now()): boolean {
    let bucket = this.buckets.get(sessionId);
    if (!bucket) {
      bucket = { tokens: ACTION.burst, at: now };
      this.buckets.set(sessionId, bucket);
    }
    bucket.tokens = Math.min(ACTION.burst, bucket.tokens + (now - bucket.at) / 1000 / actionRefill(punchRateLevel));
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  forget(sessionId: string): void {
    this.buckets.delete(sessionId);
  }
}
