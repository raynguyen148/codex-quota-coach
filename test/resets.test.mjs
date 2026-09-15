import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { normalizeRateLimits, makeSnapshot, DAY, HOUR } from '../lib/analysis.mjs';
import { adviseResets, todayQuota, localDayBounds } from '../lib/resets.mjs';

process.env.TZ = 'UTC';
const now = Date.parse('2026-09-15T12:00:00Z');
const credit = (hours = 48, id = 'a', extra = {}) => ({ id, status: 'available', resetType: 'codexRateLimits', title: 'Full reset', grantedAt: (now - DAY) / 1000, expiresAt: (now + hours * HOUR) / 1000, ...extra });
function fixture({ remaining = 30, resetHours = 96, credits = [credit()], count = credits?.length ?? 2, rate = 20, high = rate, confidence = 'medium' } = {}) {
  const raw = { accountId: 'a', ordinaryUsageAllowed: true,
    rateLimits: { limitId: 'codex', planType: 'pro', spendControlReached: false,
      primary: { usedPercent: 100 - remaining, windowDurationMins: 10080, resetsAt: (now + resetHours * HOUR) / 1000 } },
    rateLimitResetCredits: { availableCount: count, credits } };
  const n = normalizeRateLimits(raw);
  const analysis = { entries: [{ limitId: 'codex', window: n.buckets[0].windows[0],
    burn: { perDay: rate, lowPerDay: rate / 2, highPerDay: high, confidence,
      source: confidence === 'low' ? 'current-window average' : 'recency-weighted quota history' } }] };
  return { n, analysis };
}
function advise(options, history = [], runtime = {}) {
  const { n, analysis } = fixture(options);
  return adviseResets(n, analysis, history, now, runtime);
}
function snapshot(f, hoursAgo, used, mutate = () => {}) {
  const n = structuredClone(f.n); n.buckets[0].windows[0].usedPercent = used;
  n.buckets[0].windows[0].remainingPercent = 100 - used;
  mutate(n);
  return makeSnapshot(n, null, now - hoursAgo * HOUR);
}

test('low quota plus near expiry gives conditional manual advice, not verified eligibility', () => {
  const r = advise({ remaining: 10, confidence: 'low' });
  assert.equal(r.status, 'consider_manual');
  assert.match(r.detail, /If you still need useful work/);
  assert.match(r.eligibility, /Not checked/);
});
test('healthy quota is never told to reset now merely because a credit expires', () => {
  const r = advise({ remaining: 80, rate: 10, credits: [credit(12)] });
  assert.equal(r.status, 'expiry_risk');
  assert.match(r.detail, /do not reset a healthy quota/);
});
test('average pace reaches low quota before expiry and natural reset', () => {
  const r = advise({ remaining: 30, rate: 20 });
  assert.equal(r.status, 'watch');
  assert.equal(r.credits[0].projectedLowAt, now + DAY);
});
test('uncertain high pace only triggers a watch, not use-now advice', () => {
  const r = advise({ remaining: 80, rate: 5, high: 100, credits: [credit(24)] });
  assert.equal(r.credits[0].status, 'pace_sensitive');
  assert.equal(r.status, 'watch');
});
test('recent fallback cannot establish confidently unused credits', () => {
  const r = advise({ remaining: 80, rate: 5, confidence: 'low', credits: [credit(12), credit(12, 'b')] });
  assert.equal(r.status, 'unknown'); assert.deepEqual(r.expiryPressure, []);
});
test('natural reset close with surviving credit favors waiting', () => {
  assert.equal(advise({ remaining: 5, resetHours: 2, credits: [credit(24)] }).status, 'wait_natural_reset');
  assert.equal(advise({ remaining: 5, resetHours: 2, credits: [credit(1)] }).status, 'consider_manual');
});
test('natural reset before expiry does not project depletion across that reset', () => {
  const r = advise({ remaining: 60, rate: 10, resetHours: 24, credits: [credit(72)] });
  assert.equal(r.credits[0].status, 'natural_reset_first');
  assert.equal(r.status, 'wait_natural_reset');
});
test('planning leaves a 15-minute margin and excludes exact natural-reset crossings', () => {
  const r = advise({ remaining: 30, rate: 20, credits: [credit(24)] });
  assert.notEqual(r.credits[0].status, 'watch_before_expiry');
  const near = advise({ remaining: 30, rate: 20, resetHours: 24, credits: [credit(48)] });
  assert.equal(near.credits[0].status, 'natural_reset_first');
});
test('multi-credit pressure uses one pool of demand instead of reusing the first opportunity', () => {
  const r = advise({ remaining: 5, rate: 20, credits: [credit(48, 'a'), credit(48, 'b'), credit(48, 'c')] });
  assert.equal(r.expiryPressure[0].knownCreditsDue, 3);
  assert.equal(r.expiryPressure[0].optimisticUseCount, 1);
  assert.equal(r.expiryPressure[0].potentiallyUnused, 2);
});
test('different deadlines use cumulative counts, with higher demand reducing pressure', () => {
  const credits = [credit(48, 'a'), credit(12, 'b'), credit(12, 'c')];
  const r = advise({ remaining: 5, rate: 200, credits });
  assert.equal(r.credits[0].expiresAt, now + 12 * HOUR);
  assert.deepEqual(r.expiryPressure, []);
});
test('duplicate IDs do not manufacture extra credits; conflicting rows suppress advice', () => {
  const r = advise({ remaining: 5, credits: [credit(), credit()], count: 1 });
  assert.equal(r.credits.length, 1); assert.equal(r.status, 'consider_manual');
  assert.equal(advise({ credits: [credit(48), credit(72)], count: 2 }).status, 'refresh_required');
});
test('missing IDs do not imply identical credits and disable aggregate counting', () => {
  const r = advise({ remaining: 5, credits: [credit(48, null), credit(48, null)] });
  assert.equal(r.credits.length, 2); assert.deepEqual(r.expiryPressure, []);
});
test('count-only inventory and unknown expiries never invent an expiry deadline', () => {
  const r = advise({ credits: null });
  assert.equal(r.status, 'unknown'); assert.equal(r.recheckAt, null);
  assert.match(r.notes.join(), /2 credit/);
  const unknown = advise({ credits: [credit(48, 'a', { expiresAt: null })] });
  assert.equal(unknown.credits[0].status, 'unknown_expiry');
});
test('partial detail rows do not assign known expiry to hidden credits', () => {
  const r = advise({ remaining: 5, credits: [credit()], count: 5 });
  assert.equal(r.credits.length, 1); assert.deepEqual(r.expiryPressure, []);
  assert.match(r.notes.join(), /4 credit/);
});
test('expired/revoked/wrong-type and future-grant credits cannot trigger manual advice', () => {
  assert.equal(advise({ remaining: 0, credits: [credit(-1)] }).status, 'refresh_required');
  assert.equal(advise({ remaining: 0, credits: [credit(1, 'a', { status: 'consumed' })] }).status, 'unknown');
  assert.equal(advise({ remaining: 0, credits: [credit(1, 'a', { resetType: 'unknown' })] }).status, 'unknown');
  assert.equal(advise({ remaining: 0, credits: [credit(1, 'a', { grantedAt: (now + HOUR) / 1000 })] }).status, 'refresh_required');
});
test('no count is distinct from zero; mismatched authoritative count suppresses advice', () => {
  assert.equal(advise({ credits: [], count: 0 }).status, 'none');
  assert.equal(advise({ credits: [credit()], count: null }).status, 'unknown');
  assert.equal(advise({ credits: [credit()], count: 0 }).status, 'refresh_required');
});
test('missing identity/core and stale, offline, future capture produce no actionable advice', () => {
  assert.equal(advise({ remaining: 5 }, [], { offline: true }).status, 'refresh_required');
  assert.equal(advise({ remaining: 5 }, [], { capturedAt: now - HOUR }).status, 'refresh_required');
  assert.equal(advise({ remaining: 5 }, [], { capturedAt: now + 1 }).status, 'refresh_required');
  const f = fixture({ remaining: 5 }); f.n.accountId = null;
  assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'unknown');
  f.n.accountId = 'a'; f.n.buckets[0].limitId = 'spark';
  assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'unknown');
});
test('workspace/spend restrictions are not treated as quota-reset remedies', () => {
  for (const restriction of ['workspace_owner_credits_depleted', 'workspace_member_usage_limit_reached']) {
    const f = fixture({ remaining: 0 }); f.n.buckets[0].rateLimitReachedType = restriction;
    assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'blocked');
  }
  const f = fixture({ remaining: 0 }); f.n.ordinaryUsageAllowed = false;
  assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'unknown');
  f.n.buckets[0].rateLimitReachedType = 'rate_limit_reached';
  assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'consider_manual');
});
test('one low short window is enough even when the weekly window has headroom', () => {
  const f = fixture({ remaining: 80 });
  const short = { ...f.analysis.entries[0], window: { ...f.analysis.entries[0].window, durationMins: 300, label: '5-hour', slot: 'secondary', usedPercent: 95, remainingPercent: 5, resetsAt: (now + 4 * HOUR) / 1000 } };
  f.n.buckets[0].windows.push(short.window); f.analysis.entries.push(short);
  f.n.resetCredits.credits[0].expiresAt = (now + HOUR) / 1000;
  assert.equal(adviseResets(f.n, f.analysis, [], now).status, 'consider_manual');
});
test('today uses only within-day quota deltas and reports missing midnight coverage', () => {
  const f = fixture({ remaining: 40 });
  const h = [snapshot(f, 14, 20), snapshot(f, 8, 30), snapshot(f, 4, 50)];
  const t = todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', h, now);
  assert.equal(t.usedPoints, 30); assert.equal(t.observedHours, 8);
  assert.equal(t.coverage, 8 / 12); assert.equal(t.perDay, 90);
  assert.equal(todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', [], now).usedPoints, null);
});
test('today excludes resets, corrections, account switches and plan boundaries', () => {
  const f = fixture({ remaining: 90 });
  const h = [snapshot(f, 8, 80), snapshot(f, 6, 95), snapshot(f, 4, 2), snapshot(f, 2, 5)];
  const t = todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', h, now);
  assert.equal(t.usedPoints, 23); assert.equal(t.discontinuities, 1); assert.equal(t.perDay, null);
  const foreign = [snapshot(f, 8, 1, n => { n.accountId = 'b'; })];
  assert.equal(todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', foreign, now).usedPoints, null);
  const plans = [snapshot(f, 8, 1), snapshot(f, 4, 5, n => { n.buckets[0].planType = 'plus'; })];
  assert.equal(todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', plans, now).usedPoints, null);
});
test('zero usage stays zero; an early burst does not become a daily forecast', () => {
  const f = fixture({ remaining: 40 });
  const quiet = todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', [snapshot(f, 6, 60)], now);
  assert.equal(quiet.usedPoints, 0); assert.equal(quiet.perDay, 0);
  const burst = todayQuota(f.analysis.entries[0].window, f.n.buckets[0], 'a', [snapshot(f, 0.25, 10)], now);
  assert.equal(burst.usedPoints, 50); assert.equal(burst.perDay, null);
});
test('today acceleration only affects sensitivity until local midnight', () => {
  const f = fixture({ remaining: 40, rate: 5, credits: [credit(12)] });
  const h = [snapshot(f, 6, 30)];
  const r = adviseResets(f.n, f.analysis, h, now);
  assert.equal(r.credits[0].status, 'pace_sensitive');
  assert.equal(r.windows[0].pace.todayAdjusted.todayPerDay, 120);
  assert.equal(r.windows[0].pace.todayAdjusted.perDay, 5);
});
test('DST and local dates use calendar midnight, not UTC or a fixed 24h day', () => {
  for (const [date, expected] of [['2026-03-08T16:00:00Z', 23], ['2026-11-01T16:00:00Z', 25]]) {
    const script = `import {localDayBounds} from './lib/resets.mjs';const d=localDayBounds(Date.parse('${date}'));console.log((d.end-d.start)/3600000);`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.equal(Number(r.stdout), expected);
  }
  assert.equal(localDayBounds(now).date, '2026-09-15');
});
test('reset advice is pure and never increases the base quota budget', () => {
  const f = fixture(); const before = JSON.stringify(f);
  adviseResets(f.n, f.analysis, [], now);
  assert.equal(JSON.stringify(f), before);
});

test('credits beyond seven days stay outside the forecast even at a very high pace', () => {
  const r = advise({ remaining: 5, rate: 100, credits: [credit(24 * 20)] });
  assert.equal(r.credits[0].status, 'beyond_horizon');
  assert.equal(r.recheckAt, null); assert.deepEqual(r.expiryPressure, []);
});
