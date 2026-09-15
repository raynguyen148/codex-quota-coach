import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR, normalizeRateLimits, normalizeUsage, makeSnapshot, snapshotNormalized, analyze, dailyUsage, sameCycle } from '../lib/analysis.mjs';

const now = Date.parse('2026-09-15T12:00:00Z');
const end = (now + 3 * DAY) / 1000;
function raw(used = 40, extra = {}) {
  return { accountId: 'account-a', ordinaryUsageAllowed: true,
    rateLimits: { limitId: 'codex', planType: 'pro', primary: { usedPercent: used, windowDurationMins: 10080, resetsAt: end } }, ...extra };
}
const norm = (used = 40) => normalizeRateLimits(raw(used));
function historyAt(hours, used, options = {}) {
  const n = norm(used);
  if (options.accountId) n.accountId = options.accountId;
  if (options.planType) n.buckets[0].planType = options.planType;
  if (options.reset) n.buckets[0].windows[0].resetsAt = options.reset;
  return makeSnapshot(n, null, now - hours * HOUR);
}
const entry = (n, h = [], reserve = 10) => analyze(n, h, now, reserve).entries[0];

test('normalizes all buckets, uses durations, and honors multi-bucket source of truth', () => {
  const n = normalizeRateLimits(raw(99, { rateLimitsByLimitId: {
    other: { primary: { usedPercent: 50, windowDurationMins: 300 } }, codex: raw(40).rateLimits,
  } }));
  assert.equal(n.buckets.length, 2);
  assert.equal(n.buckets[0].windows[0].label, 'Weekly');
  assert.equal(n.buckets[0].windows[0].remainingPercent, 60);
  assert.equal(n.buckets[1].windows[0].label, '5-hour');
});
test('null, absent, string and negative usage never become 100% available', () => {
  for (const used of [null, undefined, '0', -1, NaN]) assert.equal(normalizeRateLimits(raw(used === undefined ? null : used)).buckets[0].windows[0].remainingPercent, null);
  assert.equal(normalizeRateLimits(raw(101)).buckets[0].windows[0].remainingPercent, 0);
});
test('reset counts are unknown when missing; count is authoritative over detail rows', () => {
  assert.equal(normalizeRateLimits(raw(0, { rateLimitResetCredits: {} })).resetCredits.availableCount, null);
  assert.equal(normalizeRateLimits(raw(0, { rateLimitResetCredits: { availableCount: 3, credits: [] } })).resetCredits.availableCount, 3);
});
test('sameCycle requires exact known reset and duration', () => {
  assert.equal(sameCycle({ durationMins: 300 }, { durationMins: 300 }), false);
  assert.equal(sameCycle({ durationMins: 300, resetsAt: end }, { durationMins: 300, resetsAt: end + 1 }), false);
});
test('history is isolated by account and plan', () => {
  const h = [historyAt(48, 0, { accountId: 'other' }), historyAt(24, 10, { planType: 'plus' })];
  assert.equal(entry(norm(), h).burn.source, 'current-window average');
  const n = norm(); n.accountId = null;
  assert.equal(entry(n, [historyAt(24, 20)]).burn.source, 'current-window average');
});
test('a plan switch and return cannot bridge the old measurements', () => {
  const e = entry(norm(), [historyAt(48, 10), historyAt(24, 20, { planType: 'plus' }), historyAt(1, 39)]);
  assert.equal(e.burn.source, 'current-window average');
});
test('zero recent consumption overrides nonzero lifetime-window pace', () => {
  const h = [historyAt(36, 40), historyAt(24, 40), historyAt(12, 40)];
  const e = entry(norm(), h);
  assert.equal(e.burn.perDay, 0);
  assert.equal(e.burn.confidence, 'medium');
  assert.equal(e.recommendation.level, 'surplus');
});
test('recent heavier intervals receive more weight', () => {
  const e = entry(norm(60), [historyAt(48, 0), historyAt(36, 5), historyAt(24, 10), historyAt(12, 35)]);
  assert.ok(e.burn.perDay > 30);
  assert.equal(e.burn.trends[0].perDay, 50);
});
test('sparse data cannot invent a 24h trend or confidently encourage more', () => {
  const e = entry(norm(), [historyAt(48, 20)]);
  assert.equal(e.burn.trends[0].perDay, null);
  assert.equal(e.burn.confidence, 'low');
  assert.notEqual(e.recommendation.level, 'surplus');
});
test('a reset or counter correction breaks the forecast history', () => {
  for (const options of [{ reset: end - DAY / 1000 }, {}]) {
    const e = entry(norm(10), [historyAt(48, 70, options), historyAt(12, 5)]);
    assert.equal(e.burn.perDay, 10);
    assert.equal(e.burn.discontinuities, 1);
  }
});
test('rapid duplicate checks do not raise sample confidence', () => {
  const h = Array.from({ length: 30 }, (_, i) => historyAt((30 - i) / 60, 39));
  const e = entry(norm(), h);
  assert.equal(e.burn.source, 'current-window average');
  assert.equal(e.burn.confidence, 'low');
});
test('exhaustion forecast never extends past the natural reset', () => {
  assert.equal(entry(norm(40), [historyAt(24, 39)]).forecast.exhaustionAt, null);
  assert.ok(entry(norm(90), [historyAt(24, 50)]).forecast.exhaustionAt < end * 1000);
});
test('missing burn does not invent projected remaining; expired reset gives no budget', () => {
  const n = norm(0); n.buckets[0].windows[0].resetsAt = (now + 7 * DAY) / 1000;
  assert.equal(entry(n).forecast.projectedRemaining, null);
  n.buckets[0].windows[0].resetsAt = now / 1000;
  assert.equal(entry(n).forecast, null);
});
test('buffer changes budget but not actual exhaustion; exhausted quota is critical', () => {
  const h = [historyAt(24, 30)];
  assert.equal(entry(norm(), h, 10).forecast.safePerDay, 50 / 3);
  assert.equal(entry(norm(), h, 0).forecast.safePerDay, 20);
  assert.equal(entry(norm(100)).recommendation.level, 'critical');
});
test('backend permission and spend controls override positive quota', () => {
  const n = norm(); n.ordinaryUsageAllowed = false;
  assert.equal(analyze(n, [], now).recommendation.level, 'critical');
  n.ordinaryUsageAllowed = true; n.buckets[0].spendControlReached = true;
  assert.equal(analyze(n, [], now).recommendation.level, 'critical');
});
test('an exhausted short window overrides a healthy weekly window in the same bucket', () => {
  const n = norm(); n.buckets[0].windows.push({ limitId: 'codex', slot: 'secondary', label: '5-hour', durationMins: 300, usedPercent: 100, remainingPercent: 0, resetsAt: (now + HOUR) / 1000 });
  assert.equal(analyze(n, [], now).recommendation.level, 'critical');
});
test('an unrelated optional bucket does not claim the core bucket is exhausted', () => {
  const n = normalizeRateLimits(raw(40, { rateLimitsByLimitId: { codex: raw().rateLimits, optional: raw(100).rateLimits } }));
  assert.notEqual(analyze(n, [], now).recommendation.level, 'critical');
  assert.equal(analyze(n, [], now).entries.find(e => e.limitId === 'optional').recommendation.level, 'critical');
});
test('v0.1 history remains usable', () => {
  const h = historyAt(24, 20); delete h.buckets; delete h.schemaVersion;
  assert.equal(snapshotNormalized(h).buckets[0].windows[0].limitId, 'codex');
  assert.equal(entry(norm(), [h]).burn.perDay, 20);
});
test('daily buckets sort, deduplicate, validate, and retain unknown values', () => {
  const u = normalizeUsage({ summary: { lifetimeTokens: null, currentStreakDays: 0 }, dailyUsageBuckets: [
    { startDate: '2026-09-14', tokens: 10 }, { startDate: '2026-09-12', tokens: 0 },
    { startDate: '2026-09-14', tokens: 20 }, { startDate: '2026-02-30', tokens: 100 },
    { startDate: '2026-09-13', tokens: null },
  ] });
  assert.equal(u.summary.lifetimeTokens, null);
  assert.equal(u.summary.currentStreakDays, 0);
  const d = dailyUsage(u, 4, now);
  assert.equal(d.totalTokens, 20);
  assert.equal(d.missingDays, 2);
  assert.equal(u.invalidBuckets, 2);
  assert.equal(normalizeUsage(null), null);
});
test('daily tokens never enter quota predictions', () => {
  const h = historyAt(24, 20); h.usage = { summary: { lifetimeTokens: 1e12 } };
  assert.deepEqual(entry(norm(), [h]).burn, entry(norm(), [historyAt(24, 20)]).burn);
});

test('alternative advice needs an identified bucket, available windows, and confirmed account access', () => {
  const n = normalizeRateLimits(raw(95, { rateLimitsByLimitId: { codex: raw(95).rateLimits,
    other: { ...raw(10).rateLimits, limitName: 'Backend model label' } } }));
  assert.equal(analyze(n, [], now).alternatives[0].name, 'Backend model label');
  n.ordinaryUsageAllowed = false;
  assert.deepEqual(analyze(n, [], now).alternatives, []);
  n.ordinaryUsageAllowed = true; n.buckets[1].limitName = null;
  assert.deepEqual(analyze(n, [], now).alternatives, []);
});
