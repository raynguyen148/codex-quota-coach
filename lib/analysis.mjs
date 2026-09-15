export const DAY = 86400000;
export const HOUR = 3600000;
export const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const positive = value => finite(value) !== null && value > 0 ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const clamp = value => Math.min(100, Math.max(0, value));

export function windowLabel(minutes) {
  if (!minutes) return 'Quota';
  if (minutes === 10080) return 'Weekly';
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

export function normalizeRateLimits(raw) {
  const entries = Object.entries(raw?.rateLimitsByLimitId || {}).filter(([, b]) => b && typeof b === 'object');
  if (!entries.length && raw?.rateLimits) entries.push([raw.rateLimits.limitId || 'codex', raw.rateLimits]);
  if (!entries.length) throw new Error('Codex returned no rate-limit snapshot.');
  entries.sort(([a], [b]) => a === 'codex' ? -1 : b === 'codex' ? 1 : a.localeCompare(b));
  const buckets = entries.map(([id, bucket]) => ({
    limitId: id, limitName: bucket.limitName ?? null, normalModelSlug: bucket.normalModelSlug ?? null,
    planType: bucket.planType ?? null, credits: bucket.credits ?? null,
    individualLimit: bucket.individualLimit ?? null,
    spendControlReached: typeof bucket.spendControlReached === 'boolean' ? bucket.spendControlReached : null,
    rateLimitReachedType: bucket.rateLimitReachedType ?? null,
    windows: ['primary', 'secondary'].flatMap(slot => {
      const w = bucket[slot];
      if (!w || typeof w !== 'object') return [];
      const used = finite(w.usedPercent);
      const durationMins = positive(w.windowDurationMins);
      return [{ limitId: id, slot, label: windowLabel(durationMins), durationMins,
        usedPercent: used === null || used < 0 ? null : used,
        remainingPercent: used === null || used < 0 ? null : clamp(100 - used),
        resetsAt: positive(w.resetsAt) }];
    }).sort((a, b) => (a.durationMins || Infinity) - (b.durationMins || Infinity)),
  }));
  const reset = raw.rateLimitResetCredits;
  return {
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    ordinaryUsageAllowed: typeof raw.ordinaryUsageAllowed === 'boolean' ? raw.ordinaryUsageAllowed : null,
    buckets,
    resetCredits: reset ? {
      availableCount: count(reset.availableCount),
      credits: Array.isArray(reset.credits) ? reset.credits.filter(c => c?.status === 'available').map(c => ({
        id: typeof c.id === 'string' ? c.id : null,
        title: c.title ?? null, status: c.status, resetType: c.resetType ?? null,
        grantedAt: positive(c.grantedAt), expiresAt: positive(c.expiresAt),
      })) : null,
    } : null,
  };
}

export function normalizeUsage(raw) {
  if (!raw) return null;
  const summary = Object.fromEntries(['lifetimeTokens', 'peakDailyTokens', 'longestRunningTurnSec', 'currentStreakDays', 'longestStreakDays']
    .map(key => [key, count(raw.summary?.[key])]));
  const daily = new Map();
  let invalidBuckets = 0;
  for (const row of Array.isArray(raw.dailyUsageBuckets) ? raw.dailyUsageBuckets : []) {
    const date = row?.startDate;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date || count(row.tokens) === null) { invalidBuckets++; continue; }
    // Repeated buckets are updates, never additive copies.
    daily.set(date, { startDate: date, tokens: row.tokens });
  }
  return { summary, dailyUsageBuckets: raw.dailyUsageBuckets == null ? null : [...daily.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    invalidBuckets, threadUsage: raw.threadUsage ?? null,
    source: 'account/usage/read', timezone: 'Backend date labels; timezone not specified by the protocol',
  };
}

export function makeSnapshot(normalized, usage, now = Date.now()) {
  const main = normalized.buckets.find(b => b.limitId === 'codex') || normalized.buckets[0];
  return { schemaVersion: 2, capturedAt: new Date(now).toISOString(), accountId: normalized.accountId,
    // Keep v0.1 fields readable for existing tooling, while preserving every bucket.
    planType: main?.planType ?? null, limitId: main?.limitId ?? null, windows: main?.windows ?? [],
    buckets: normalized.buckets, ordinaryUsageAllowed: normalized.ordinaryUsageAllowed,
    resetCredits: normalized.resetCredits, usage,
  };
}

export function snapshotNormalized(snapshot) {
  return { accountId: snapshot.accountId ?? null, ordinaryUsageAllowed: snapshot.ordinaryUsageAllowed ?? null,
    buckets: Array.isArray(snapshot.buckets) ? snapshot.buckets : [{
      limitId: snapshot.limitId || 'codex', planType: snapshot.planType ?? null,
      windows: (snapshot.windows || []).map(w => ({ ...w, limitId: snapshot.limitId || 'codex' })),
    }], resetCredits: snapshot.resetCredits ?? null };
}

export function sameCycle(a, b) {
  return a?.durationMins > 0 && a.durationMins === b?.durationMins && a.resetsAt > 0 && a.resetsAt === b?.resetsAt;
}

function observations(window, bucket, normalized, history, now) {
  if (!normalized.accountId) return [];
  const points = new Map();
  for (const h of history) {
    const time = Date.parse(h.capturedAt);
    if (h.accountId !== normalized.accountId || !Number.isFinite(time) || time > now || time < now - 7 * DAY) continue;
    const b = snapshotNormalized(h).buckets.find(b => b.limitId === bucket.limitId);
    if (!b || b.planType !== bucket.planType) {
      points.set(time, { time, window: {} });
      continue;
    }
    const w = b.windows?.find(w => w.durationMins === window.durationMins &&
      (b.windows.filter(x => x.durationMins === w.durationMins).length === 1 || w.slot === window.slot));
    // Retain cycle boundaries and counter drops to avoid bridging across them.
    points.set(time, { time, window: w || {} });
  }
  points.set(now, { time: now, window });
  return [...points.values()].sort((a, b) => a.time - b.time);
}

export function estimateBurn(window, bucket, normalized, history, now) {
  const points = observations(window, bucket, normalized, history, now);
  const segments = [];
  let discontinuities = 0;
  let baseline = points[0];
  for (const point of points.slice(1)) {
    const a = baseline.window, b = point.window;
    if (!sameCycle(a, b) || finite(a.usedPercent) === null || finite(b.usedPercent) === null || b.usedPercent < a.usedPercent) {
      discontinuities++; baseline = point; continue;
    }
    // Coalesce rapid checks to avoid turning 1%-resolution noise into an hourly trend.
    const elapsed = point.time - baseline.time;
    if (elapsed < HOUR) continue;
    segments.push({ start: baseline.time, end: point.time, elapsed, delta: b.usedPercent - a.usedPercent,
      censored: b.usedPercent >= 100, rate: (b.usedPercent - a.usedPercent) / elapsed * DAY });
    baseline = point;
  }
  const trend = days => {
    // Do not spread an unknown multi-day interval into an invented daily measurement.
    const rows = segments.filter(s => s.start >= now - days * DAY);
    const covered = rows.reduce((sum, s) => sum + s.elapsed, 0);
    const coverage = covered / (days * DAY);
    return { days, perDay: coverage >= 0.75 ? rows.reduce((sum, s) => sum + s.delta, 0) / covered * DAY : null,
      observedHours: covered / HOUR, coverage: Math.min(1, coverage), samples: rows.length,
      maxGapHours: rows.length ? Math.max(...rows.map(s => s.elapsed / HOUR)) : null };
  };
  const trends = [1, 3, 7].map(trend);
  // Use history after the latest reset/correction for a forecast of this cycle.
  let cycleStart = points.length ? points[0].time : now;
  for (let i = 1; i < points.length; i++) {
    if (!sameCycle(points[i - 1].window, points[i].window) || points[i].window.usedPercent < points[i - 1].window.usedPercent) cycleStart = points[i].time;
  }
  const recent = segments.filter(s => s.start >= cycleStart && s.end >= now - 3 * DAY);
  const span = recent.reduce((sum, s) => sum + s.elapsed, 0);
  if (span >= 6 * HOUR && recent.length) {
    const weighted = recent.map(s => ({ ...s, weight: s.elapsed * 2 ** (-(now - (s.start + s.end) / 2) / DAY) }));
    const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
    const perDay = weighted.reduce((sum, s) => sum + s.rate * s.weight, 0) / totalWeight;
    const resolution = weighted.reduce((sum, s) => sum + (DAY / s.elapsed) * s.weight, 0) / totalWeight;
    const variation = Math.sqrt(weighted.reduce((sum, s) => sum + (s.rate - perDay) ** 2 * s.weight, 0) / totalWeight);
    const maxGap = Math.max(...recent.map(s => s.elapsed));
    const confidence = recent.some(s => s.censored) || maxGap > 18 * HOUR || span < DAY || recent.length < 3 ? 'low'
      : span >= 3 * DAY && maxGap <= 12 * HOUR && recent.length >= 6 ? 'high' : 'medium';
    return { perDay, lowPerDay: Math.max(0, perDay - Math.max(resolution, variation)), highPerDay: perDay + Math.max(resolution, variation),
      source: 'recency-weighted quota history', confidence, sampleHours: span / HOUR, samples: recent.length,
      maxGapHours: maxGap / HOUR, discontinuities, trends,
      note: 'Pace range is a sensitivity estimate, not a statistical confidence interval. Integer quota readings have limited precision.' };
  }
  const elapsed = now - (window.resetsAt * 1000 - window.durationMins * 60000);
  if (finite(window.usedPercent) !== null && window.durationMins && window.resetsAt * 1000 > now && elapsed >= HOUR && elapsed <= window.durationMins * 60000) {
    const perDay = window.usedPercent / elapsed * DAY;
    return { perDay, lowPerDay: null, highPerDay: null, source: 'current-window average', confidence: 'low',
      sampleHours: elapsed / HOUR, samples: 1, maxGapHours: null, discontinuities, trends,
      note: 'Fallback assumes a full window before the reported reset. It cannot establish recent pace.' };
  }
  return { perDay: null, lowPerDay: null, highPerDay: null, source: 'insufficient history', confidence: 'low',
    sampleHours: 0, samples: 0, discontinuities, trends };
}

export function forecastWindow(window, burn, now, reserve = 10) {
  if (finite(window.remainingPercent) === null || !window.resetsAt || window.resetsAt * 1000 <= now) return null;
  const daysLeft = (window.resetsAt * 1000 - now) / DAY;
  const available = Math.max(0, window.remainingPercent - reserve);
  const hasBurn = finite(burn.perDay) !== null;
  const project = rate => finite(rate) === null ? null : clamp(window.remainingPercent - rate * daysLeft);
  return { daysLeft, reserve, sustainablePerDay: window.remainingPercent / daysLeft, safePerDay: available / daysLeft,
    projectedRemaining: hasBurn ? project(burn.perDay) : null,
    projectedLow: project(burn.highPerDay), projectedHigh: project(burn.lowPerDay),
    exhaustionAt: hasBurn && burn.perDay > 0 && window.remainingPercent / burn.perDay < daysLeft
      ? now + window.remainingPercent / burn.perDay * DAY : null,
    reductionPercent: hasBurn && burn.perDay > 0 ? Math.max(0, (1 - available / daysLeft / burn.perDay) * 100) : null,
    extraPerDay: finite(burn.highPerDay) !== null ? Math.max(0, available / daysLeft - burn.highPerDay) : null,
  };
}

export function recommendWindow(window, burn, forecast) {
  if (window.remainingPercent === 0) return { level: 'critical', title: 'Quota exhausted', detail: 'Wait for the service to report available quota.' };
  if (!forecast) return { level: 'unknown', title: 'Forecast unavailable', detail: 'A current usage value and a future reset time are required.' };
  if (burn.perDay === null) return { level: 'unknown', title: 'Collect more snapshots', detail: 'Budget is available, but recent pace is not yet known.' };
  const provisional = burn.confidence === 'low';
  if (forecast.exhaustionAt) return { level: 'tight', title: provisional ? 'Possible shortfall — limited evidence' : 'Slow down to reach the reset',
    detail: `At this pace, quota may run out before reset. Reduce burn about ${Math.ceil(forecast.reductionPercent)}% to retain the ${forecast.reserve}% buffer.` };
  if (forecast.projectedRemaining < forecast.reserve) return { level: 'tight', title: 'Protect the remaining buffer',
    detail: `Current pace may finish below your ${forecast.reserve}% buffer. Aim for the suggested budget.` };
  if (provisional) return { level: 'unknown', title: 'Pace looks sustainable; evidence is limited',
    detail: 'Check near the start and end of work sessions to improve the recent forecast.' };
  if (forecast.projectedLow !== null && forecast.projectedLow >= forecast.reserve + 15 && forecast.extraPerDay > 0) {
    return { level: 'surplus', title: 'Room for more useful work', detail: 'Even the higher observed pace leaves a buffer. Use the headroom for valuable tasks and re-check after heavier work.' };
  }
  if (forecast.projectedLow !== null && forecast.projectedLow < forecast.reserve) return { level: 'balanced', title: 'On track, but pace varies', detail: 'A busier stretch could use the buffer. Keep near the suggested budget.' };
  return { level: 'balanced', title: 'Usage is on track', detail: 'Current pace is within the suggested budget.' };
}

export function analyze(normalized, history, now = Date.now(), reserve = 10) {
  const entries = normalized.buckets.flatMap(bucket => bucket.windows.map(window => {
    const burn = estimateBurn(window, bucket, normalized, history, now);
    const forecast = forecastWindow(window, burn, now, reserve);
    return { limitId: bucket.limitId, window, burn, forecast, recommendation: recommendWindow(window, burn, forecast) };
  }));
  const core = entries.filter(e => e.limitId === 'codex');
  const planning = core.length ? core : entries;
  const rank = { critical: 5, tight: 4, unknown: 3, balanced: 2, surplus: 1 };
  const limiting = [...planning].sort((a, b) => rank[b.recommendation.level] - rank[a.recommendation.level])[0];
  const relevantBuckets = normalized.buckets.filter(b => !core.length || b.limitId === 'codex');
  const blocked = normalized.ordinaryUsageAllowed === false || relevantBuckets.some(b => b.spendControlReached === true || b.rateLimitReachedType);
  let recommendation = blocked ? { level: 'critical', title: 'Included usage is blocked by the service', detail: 'Available percentages do not override the backend restriction.' }
    : limiting ? { ...limiting.recommendation, limitId: limiting.limitId, window: limiting.window.label }
    : { level: 'unknown', title: 'No quota windows available', detail: 'The backend did not return an active window.' };
  if (!blocked && recommendation.level === 'surplus' && normalized.ordinaryUsageAllowed !== true) recommendation = {
    level: 'unknown', title: 'Headroom detected; access status unavailable', detail: 'The backend did not confirm ordinary usage permission.',
  };
  const alternatives = normalized.ordinaryUsageAllowed === true && ['tight', 'critical'].includes(recommendation.level)
    ? normalized.buckets.filter(b => b.limitId !== (limiting?.limitId || 'codex') &&
      (b.normalModelSlug || b.limitName) && b.spendControlReached !== true && !b.rateLimitReachedType &&
      b.windows.length > 0 && b.windows.every(w => finite(w.remainingPercent) !== null && w.remainingPercent >= 25 && w.resetsAt * 1000 > now))
      .map(b => ({ limitId: b.limitId, name: b.normalModelSlug || b.limitName, minimumRemainingPercent: Math.min(...b.windows.map(w => w.remainingPercent)),
        note: 'Separate reported quota; consider only for tasks this model is suitable for. Quota does not establish model capability.' })) : [];
  return { entries, recommendation, alternatives, reserve, evaluatedAt: new Date(now).toISOString() };
}

// Quota risk without an unredeemed manual reset. These are planning categories,
// not probabilities; uncertainty must never be presented as a green status.
export function quickStatus(analysis, { offline = false } = {}) {
  const entries = analysis?.entries || [];
  const core = entries.filter(e => e.limitId === 'codex');
  const rank = { danger: 5, high: 4, unknown: 3, low: 2, ok: 1 };
  const classify = e => {
    if (e.window.remainingPercent === 0) return { risk: 'danger', label: 'DANGER', message: 'Quota is exhausted. Current access needs attention.' };
    if (!e.forecast || finite(e.forecast.projectedRemaining) === null || !['medium', 'high'].includes(e.burn.confidence) || finite(e.burn.perDay) === null)
      return { risk: 'unknown', label: 'UNKNOWN', message: 'Not enough reliable evidence to rate the current pace.' };
    if (e.forecast.exhaustionAt) return { risk: 'high', label: 'HIGH RISK', message: 'Current pace may exhaust quota before the natural reset.' };
    if (e.forecast.projectedRemaining < e.forecast.reserve || (e.forecast.projectedLow !== null && e.forecast.projectedLow < e.forecast.reserve))
      return { risk: 'low', label: 'LOW RISK', message: 'Quota may last, but the safety buffer is at risk.' };
    return { risk: 'ok', label: 'ON TRACK', message: 'Observed pace leaves the planned quota buffer.' };
  };
  const ranked = (core.length ? core : entries).map(e => ({ ...classify(e), entry: e }))
    .sort((a, b) => rank[b.risk] - rank[a.risk]);
  let status = ranked[0] || { risk: 'unknown', label: 'UNKNOWN', message: 'No quota forecast is available.', entry: null };
  if (analysis?.recommendation.level === 'critical') status = { ...status, risk: 'danger', label: 'DANGER', message: analysis.recommendation.title };
  if (offline) status = { ...status, risk: 'unknown', label: 'CACHED / UNKNOWN', message: 'Refresh live quota before deciding what to do.' };
  const e = status.entry;
  return { risk: status.risk, label: status.label, message: status.message, basis: 'without manual reset',
    limitId: e?.limitId ?? null, window: e?.window.label ?? null, durationMins: e?.window.durationMins ?? null,
    perDay: e?.burn.perDay ?? null, safePerDay: e?.forecast?.safePerDay ?? null,
    aboveBudgetPercent: finite(e?.burn.perDay) !== null && e?.forecast?.safePerDay > 0
      ? Math.max(0, (e.burn.perDay / e.forecast.safePerDay - 1) * 100) : null,
    confidence: e?.burn.confidence ?? 'unknown', source: e?.burn.source ?? 'unavailable' };
}

export function dailyUsage(usage, days = 7, now = Date.now()) {
  const end = new Date(now).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end) - (days - 1) * DAY).toISOString().slice(0, 10);
  const rows = (usage?.dailyUsageBuckets || []).filter(row => row.startDate >= start && row.startDate <= end);
  return { start, end, days, rows, reportedDays: rows.length, missingDays: days - rows.length,
    totalTokens: rows.length ? rows.reduce((sum, row) => sum + row.tokens, 0) : null,
    latestDate: usage?.dailyUsageBuckets?.at(-1)?.startDate ?? null };
}
