import { DAY, HOUR, finite, sameCycle, snapshotNormalized } from './analysis.mjs';

// Advisory thresholds, not a backend eligibility contract. No consume RPC is used.
export const RESET_POLICY = Object.freeze({ lowQuota: 10, soonHours: 72, naturalResetCloseHours: 6,
  expiryMarginMinutes: 15, horizonDays: 7, todayMinimumHours: 3, staleMinutes: 15 });
const validTime = n => finite(n) !== null && n > 0 && Number.isFinite(new Date(n).getTime());
const validUsed = w => finite(w?.usedPercent) !== null && w.usedPercent >= 0 && w.usedPercent <= 100;

export function localDayBounds(now) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { start: start.getTime(), end: end.getTime(), date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

export function todayQuota(window, bucket, accountId, history, now) {
  const day = localDayBounds(now);
  const points = new Map();
  if (accountId) for (const snapshot of history) {
    const time = Date.parse(snapshot.capturedAt);
    if (snapshot.accountId !== accountId || time < day.start || time >= now || !Number.isFinite(time)) continue;
    const b = snapshotNormalized(snapshot).buckets.find(b => b.limitId === bucket.limitId);
    const matches = b?.windows?.filter(w => w.durationMins === window.durationMins) || [];
    const match = matches.length === 1 ? matches[0] : matches.find(w => w.slot === window.slot);
    points.set(time, { time, window: b?.planType === bucket.planType ? match : null });
  }
  points.set(now, { time: now, window });
  const ordered = [...points.values()].sort((a, b) => a.time - b.time);
  let usedPoints = 0, observedMs = 0, intervals = 0, discontinuities = 0, saturated = false;
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1], b = ordered[i];
    if (!sameCycle(a.window, b.window) || !validUsed(a.window) || !validUsed(b.window) || b.window.usedPercent < a.window.usedPercent) {
      discontinuities++; continue;
    }
    usedPoints += b.window.usedPercent - a.window.usedPercent;
    observedMs += b.time - a.time; intervals++;
    saturated ||= b.window.usedPercent >= 100;
  }
  return { date: day.date, timezone: day.timezone, since: intervals ? ordered[0].time : null,
    usedPoints: intervals ? usedPoints : null, observedHours: observedMs / HOUR,
    coverage: now > day.start ? observedMs / (now - day.start) : 0, intervals, discontinuities,
    // Early bursts, missed resets and saturation cannot establish today's pace.
    perDay: observedMs >= RESET_POLICY.todayMinimumHours * HOUR && !discontinuities && !saturated
      ? usedPoints / observedMs * DAY : null,
    partial: true, note: 'Observed within-day deltas only; unobserved time and reset-crossing intervals are excluded. Not a full-day total.' };
}

function scenarios(entry, today, now, endOfToday) {
  const rate = finite(entry.burn?.perDay);
  if (rate === null || rate < 0) return null;
  const low = finite(entry.burn.lowPerDay) ?? rate;
  const high = Math.max(rate, finite(entry.burn.highPerDay) ?? rate);
  const todayRate = finite(today.perDay);
  // Today's acceleration is a sensitivity scenario until local midnight only.
  // An idle/slow morning never erases a longer-term quota forecast.
  return { average: { perDay: rate, todayPerDay: rate },
    slower: { perDay: Math.max(0, Math.min(rate, low)), todayPerDay: Math.max(0, Math.min(rate, low)) },
    faster: { perDay: high, todayPerDay: Math.max(high, todayRate ?? high) },
    todayAdjusted: { perDay: rate, todayPerDay: Math.max(rate, todayRate ?? rate) },
    todayEndsAt: endOfToday,
    reliable: ['medium', 'high'].includes(entry.burn.confidence) && entry.burn.source === 'recency-weighted quota history',
  };
}

function consumption(scenario, until, now, dayEnd) {
  return scenario.todayPerDay * Math.max(0, Math.min(until, dayEnd) - now) / DAY
    + scenario.perDay * Math.max(0, until - Math.max(dayEnd, now)) / DAY;
}

function thresholdAt(remaining, scenario, now, dayEnd) {
  const need = Math.max(0, remaining - RESET_POLICY.lowQuota);
  if (!need) return now;
  if (!scenario) return null;
  const todayCapacity = scenario.todayPerDay * Math.max(0, dayEnd - now) / DAY;
  if (scenario.todayPerDay > 0 && need <= todayCapacity) return now + need / scenario.todayPerDay * DAY;
  return scenario.perDay > 0 ? Math.max(now, dayEnd) + (need - todayCapacity) / scenario.perDay * DAY : null;
}

function inventory(reset, now) {
  const notes = [], seen = new Map(), credits = [];
  let inconsistent = false, anonymous = false;
  for (const row of Array.isArray(reset?.credits) ? reset.credits : []) {
    if (row?.status !== 'available') continue;
    if (!row.id) anonymous = true;
    const signature = JSON.stringify([row.resetType, row.grantedAt, row.expiresAt]);
    if (row.id && seen.has(row.id)) {
      if (seen.get(row.id) !== signature) inconsistent = true;
      continue;
    }
    if (row.id) seen.set(row.id, signature);
    credits.push({ id: typeof row.id === 'string' ? row.id : null, title: row.title || 'Reset credit', resetType: row.resetType,
      expiresAt: validTime(row.expiresAt * 1000) ? row.expiresAt * 1000 : null,
      grantedAt: validTime(row.grantedAt * 1000) ? row.grantedAt * 1000 : null });
  }
  credits.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  const count = Number.isSafeInteger(reset?.availableCount) && reset.availableCount >= 0 ? reset.availableCount : null;
  if (count !== null && credits.length > count) inconsistent = true;
  if (credits.some(c => c.grantedAt > now || (c.grantedAt && c.expiresAt && c.grantedAt >= c.expiresAt))) inconsistent = true;
  const missingDetails = count === null ? null : Math.max(0, count - credits.length);
  if (missingDetails) notes.push(`${missingDetails} credit(s) have no detail rows; their expiry is unknown.`);
  if (anonymous) notes.push('Some credit IDs are missing; aggregate excess-credit estimates are disabled.');
  if (inconsistent) notes.push('Credit details conflict with each other or the available count. Refresh before deciding.');
  if (credits.some(c => c.expiresAt !== null && c.expiresAt <= now)) notes.push('Some available detail rows are already expired; those rows are excluded from planning.');
  return { availableCount: count, detailsKnown: reset?.credits != null, missingDetails, credits, notes, inconsistent, anonymous };
}

// A conditional scenario, not a redemption schedule. Stop at the first known
// natural refresh: neither the next cycle nor post-redemption reset dates are
// exposed by these read RPCs. Every manual step requires a fresh assessment.
function sequentialPlan(windows, credits, now, scenario) {
  const states = windows.map(w => ({ ...w, remaining: w.remainingPercent }));
  const naturalAt = Math.min(...windows.map(w => w.naturalResetAt));
  const horizonAt = now + RESET_POLICY.horizonDays * DAY;
  const stopAt = Math.min(naturalAt, horizonAt);
  const margin = RESET_POLICY.expiryMarginMinutes * 60000;
  let cursor = now;
  const used = [], steps = [];
  for (const [creditIndex, credit] of credits.entries()) {
    if (credit.resetType !== 'codexRateLimits' || !credit.expiresAt || credit.expiresAt <= now) continue;
    const deadline = credit.expiresAt - margin;
    const step = { creditIndex, expiresAt: credit.expiresAt, deadline, checkAt: null,
      dependsOn: [...used], status: 'not_needed_before_expiry' };
    const candidates = states.map(w => thresholdAt(w.remaining, w.pace[scenario], cursor, w.pace.todayEndsAt));
    const at = Math.min(...candidates.map(t => t ?? Infinity));
    const low = states.filter(w => w.remaining <= RESET_POLICY.lowQuota);
    const waitNatural = low.length && low.every(w => w.naturalResetAt - cursor <= RESET_POLICY.naturalResetCloseHours * HOUR && deadline >= w.naturalResetAt);
    if (deadline <= now) step.status = 'deadline_passed';
    else if (credit.expiresAt > horizonAt) step.status = 'beyond_horizon';
    else if (waitNatural || (at >= stopAt && deadline >= stopAt)) step.status = 'reassess_after_natural';
    else if (at < deadline && at < stopAt) {
      step.status = 'conditional_check'; step.checkAt = at;
      step.remainingBefore = states.map(w => ({ durationMins: w.durationMins,
        remainingPercent: Math.max(0, w.remaining - consumption(w.pace[scenario], at, cursor, w.pace.todayEndsAt)) }));
      // One compatible credit hypothetically refills all modeled core windows.
      // Never count simultaneous low windows as separate reset opportunities.
      for (const w of states) w.remaining = 100;
      cursor = at; used.push(creditIndex);
    }
    steps.push(step);
  }
  return { scenario, stopAt, steps };
}

function stepFor(steps, creditIndex) {
  return steps.find(step => step.creditIndex === creditIndex) || null;
}

// Convert the detailed scenario into an explicit, human-facing decision plan.
// This remains advisory: no reset is consumed by the CLI and eligibility must
// still be confirmed in Codex before a manual reset is used.
function buildResetPlan(result, status, now) {
  const margin = RESET_POLICY.expiryMarginMinutes * 60000;
  const naturalResetAt = result.windows.length ? Math.min(...result.windows.map(window => window.naturalResetAt)) : null;
  const averageSteps = result.timeline?.scenarios.average.steps || [];
  const fasterSteps = result.timeline?.scenarios.faster.steps || [];
  const todaySteps = result.timeline?.scenarios.todayAdjusted.steps || [];
  let manualCandidateAssigned = false;
  const credits = result.credits.map((credit, creditIndex) => {
    const average = stepFor(averageSteps, creditIndex);
    const faster = stepFor(fasterSteps, creditIndex);
    const today = stepFor(todaySteps, creditIndex);
    const expiresAt = credit.expiresAt;
    const future = expiresAt !== null && expiresAt > now;
    let action = 'unknown';
    let checkAt = null;
    let dependsOn = average?.dependsOn || [];
    if (!future || ['expired', 'deadline_passed'].includes(credit.status)) action = 'unavailable';
    else if (credit.status === 'unknown_type') action = 'unsupported';
    else if (credit.status === 'unknown_expiry') action = 'unknown_expiry';
    else if (credit.status === 'beyond_horizon') action = 'later';
    else if (result.timeline?.reliable && average?.checkAt !== null && average?.checkAt !== undefined) {
      action = average.checkAt <= now ? 'use_now' : 'use_when_low'; checkAt = average.checkAt; dependsOn = average.dependsOn || [];
    } else if (credit.status === 'consider_manual' && !manualCandidateAssigned) {
      action = 'use_now'; checkAt = now; manualCandidateAssigned = true;
    } else if (credit.status === 'consider_manual') {
      action = 'hold';
    } else if (['natural_reset_soon', 'natural_reset_first'].includes(credit.status) || average?.status === 'reassess_after_natural') {
      action = 'wait_natural_reset';
    } else if (credit.status === 'pace_sensitive' || faster?.checkAt !== null || today?.checkAt !== null) {
      action = 'monitor';
      const monitorTimes = [faster?.checkAt, today?.checkAt].filter(value => value !== null && value !== undefined);
      checkAt = monitorTimes.length ? Math.min(...monitorTimes) : null;
    } else if (credit.status === 'watch_before_expiry' && credit.projectedLowAt !== null) {
      action = 'monitor'; checkAt = credit.projectedLowAt;
    } else if (['save_until_needed', 'expiry_risk', 'limited_evidence'].includes(credit.status) || average?.status === 'not_needed_before_expiry') {
      action = 'hold';
    }
    return { creditIndex, action, checkAt, dependsOn, expiresAt,
      deadline: future ? expiresAt - margin : null };
  });
  const recommended = credits.filter(credit => ['use_now', 'use_when_low'].includes(credit.action));
  const monitoring = credits.filter(credit => credit.action === 'monitor');
  const nextCheckAt = [...recommended, ...monitoring]
    .map(credit => credit.checkAt)
    .filter(value => value !== null && value !== undefined)
    .reduce((earliest, value) => Math.min(earliest, value), Infinity);
  let action;
  if (recommended.length) action = recommended[0].action;
  else if (status === 'wait_natural_reset' || credits.some(credit => credit.action === 'wait_natural_reset')) action = 'wait_natural_reset';
  else if (monitoring.length || status === 'watch') action = 'monitor';
  else if (['refresh_required', 'unavailable', 'unknown', 'blocked'].includes(status)) action = 'refresh';
  else if (status === 'none') action = 'no_action';
  else if (credits.some(credit => credit.action === 'hold')) action = 'hold';
  else action = 'no_action';
  return { action, nextNaturalResetAt: naturalResetAt,
    nextCheckAt: Number.isFinite(nextCheckAt) ? nextCheckAt : null,
    recommendedCreditIndex: recommended[0]?.creditIndex ?? null,
    recommendedCreditIndices: recommended.map(credit => credit.creditIndex),
    credits };
}

export function unifiedRecommendation(analysis, advice) {
  const baseline = analysis.recommendation;
  if (!['tight', 'critical'].includes(baseline.level) || (baseline.limitId && baseline.limitId !== 'codex')) return baseline;
  const first = advice?.timeline?.scenarios.average.steps.find(s => s.checkAt !== null);
  if (advice?.status !== 'consider_manual' && !(advice?.timeline?.reliable && first && advice.status === 'watch')) return baseline;
  return { ...baseline, level: 'conditional', title: advice.status === 'consider_manual'
    ? 'Check a manual reset for needed work' : 'Plan useful work around a reset check',
    detail: 'Without a manual reset, the current pace needs conservation. An exposed credit offers a conditional alternative: check quota and eligibility before its deadline, then refresh this plan after any reset. This does not guarantee continued access or justify extra work.',
    conditionalOnManualReset: true, checkAt: first?.checkAt ?? advice.recheckAt };
}

export function adviseResets(normalized, analysis, history, now = Date.now(), { offline = false, capturedAt = now } = {}) {
  const inv = inventory(normalized.resetCredits, now);
  const day = localDayBounds(now);
  const result = { policy: RESET_POLICY, evaluatedAt: new Date(now).toISOString(), availableCount: inv.availableCount,
    eligibility: 'Not checked by the backend. Confirm manually in Codex; 10% is an advisory threshold.',
    title: '', status: '', detail: '', notes: inv.notes, windows: [], credits: [], expiryPressure: [], timeline: null, recheckAt: null };
  const finish = (status, title, detail) => {
    Object.assign(result, { status, title, detail });
    result.plan = buildResetPlan(result, status, now);
    return result;
  };
  const age = now - capturedAt;
  if (offline || !Number.isFinite(age) || age < 0 || age > RESET_POLICY.staleMinutes * 60000) return finish('refresh_required', 'Refresh quota before considering a reset', 'Cached or stale data cannot establish current need or credit validity.');
  if (!normalized.resetCredits) return finish('unavailable', 'Reset-credit data unavailable', 'The service did not expose reset inventory.');
  if (inv.inconsistent) return finish('refresh_required', 'Reset inventory needs a fresh check', 'No use recommendation is made from inconsistent details.');
  if (inv.availableCount === 0) return finish('none', 'No banked resets available', 'There is no available reset to plan.');
  if (inv.availableCount === null) return finish('unknown', 'Available reset count is unknown', 'Expiry information alone cannot confirm an available reset.');
  const core = normalized.buckets.find(b => b.limitId === 'codex');
  if (!core) return finish('unknown', 'Core quota is not available in this view', 'Reset effects on other model buckets are not assumed. Use cq resets for the core-quota assessment.');
  if (!normalized.accountId) return finish('unknown', 'Account identity is unavailable', 'Refresh before making an account-specific reset decision.');
  const entries = analysis.entries.filter(e => e.limitId === 'codex' && [300, 10080].includes(e.window.durationMins));
  if (!entries.length || entries.some(e => !validUsed(e.window) || !validTime(e.window.resetsAt * 1000) || e.window.resetsAt * 1000 <= now)) {
    return finish('unknown', 'Current core-window data is incomplete', 'A known 5-hour or weekly window with current usage and a future reset is needed.');
  }
  const blocked = core.spendControlReached === true || (core.rateLimitReachedType && core.rateLimitReachedType !== 'rate_limit_reached');
  if (blocked) return finish('blocked', 'A reset is not a remedy for the reported restriction', 'The service reports a workspace, credit or spend-control restriction. Check that restriction in Codex.');
  if (normalized.ordinaryUsageAllowed !== true && core.rateLimitReachedType !== 'rate_limit_reached') return finish('unknown', 'Usage permission needs confirmation', 'A reset cannot be assumed to resolve an unspecified account restriction.');
  result.windows = entries.map(entry => {
    const today = todayQuota(entry.window, core, normalized.accountId, history, now);
    const pace = scenarios(entry, today, now, day.end);
    const times = Object.fromEntries(['average', 'slower', 'faster', 'todayAdjusted'].map(key => [key, thresholdAt(entry.window.remainingPercent, pace?.[key], now, day.end)]));
    return { label: entry.window.label, durationMins: entry.window.durationMins, remainingPercent: entry.window.remainingPercent,
      naturalResetAt: entry.window.resetsAt * 1000, averagePerDay: entry.burn.perDay,
      confidence: entry.burn.confidence, source: entry.burn.source, today, pace, lowQuotaAt: times };
  });
  const margin = RESET_POLICY.expiryMarginMinutes * 60000;
  for (const credit of inv.credits) {
    const row = { ...credit, status: '', projectedLowAt: null, recheckAt: null };
    if (credit.expiresAt !== null && credit.expiresAt <= now) row.status = 'expired';
    else if (credit.resetType !== 'codexRateLimits') row.status = 'unknown_type';
    else if (credit.expiresAt === null) row.status = 'unknown_expiry';
    else if (credit.expiresAt - now > RESET_POLICY.horizonDays * DAY) row.status = 'beyond_horizon';
    else {
      const deadline = credit.expiresAt - margin;
      const lowNow = result.windows.filter(w => w.remainingPercent <= RESET_POLICY.lowQuota);
      // Prefer waiting when the relevant window refreshes shortly and the credit survives it.
      const wait = lowNow.length > 0 && lowNow.every(w => w.naturalResetAt - now <= RESET_POLICY.naturalResetCloseHours * HOUR && deadline >= w.naturalResetAt);
      if (deadline <= now) row.status = 'deadline_passed';
      else if (wait) row.status = 'natural_reset_soon';
      else if (lowNow.length) row.status = credit.expiresAt - now <= RESET_POLICY.soonHours * HOUR ? 'consider_manual' : 'save_until_needed';
      else {
        const reaches = key => result.windows.filter(w => w.lowQuotaAt[key] !== null && w.lowQuotaAt[key] < Math.min(deadline, w.naturalResetAt));
        const expected = reaches('average');
        const fast = reaches('faster');
        const todayAdjusted = reaches('todayAdjusted');
        if (expected.length) {
          row.status = expected.some(w => w.pace?.reliable) ? 'watch_before_expiry' : 'limited_evidence';
          row.projectedLowAt = Math.min(...expected.map(w => w.lowQuotaAt.average));
        } else if (fast.length || todayAdjusted.length) {
          row.status = 'pace_sensitive';
          row.projectedLowAt = Math.min(...[...fast.map(w => w.lowQuotaAt.faster), ...todayAdjusted.map(w => w.lowQuotaAt.todayAdjusted)]);
        } else if (result.windows.some(w => w.naturalResetAt <= deadline)) row.status = 'natural_reset_first';
        else row.status = result.windows.every(w => w.pace?.reliable) ? 'expiry_risk' : 'limited_evidence';
      }
      row.recheckAt = Math.max(now, Math.min(now + 6 * HOUR, deadline, row.projectedLowAt ?? Infinity, ...result.windows.map(w => w.naturalResetAt)));
    }
    result.credits.push(row);
  }
  if (!inv.anonymous && result.windows.every(w => w.pace)) {
    result.timeline = { reliable: result.windows.every(w => w.pace.reliable),
      assumptions: 'Conditional scenario: each manual reset refills all modeled core windows to 100%, at the advisory 10% threshold. Dates assume the reported natural reset remains unchanged. Confirm eligibility and credit selection manually; re-run cq after every reset. Planning stops at the first natural refresh or seven days. Later steps depend on earlier resets actually happening.',
      scenarios: Object.fromEntries(['average', 'slower', 'faster', 'todayAdjusted'].map(key => [key, sequentialPlan(result.windows, result.credits, now, key)])) };
    // Keep the independent first-cycle assessments as evidence, but expose the
    // sequential time per credit instead of repeating the first opportunity.
    for (const step of result.timeline.scenarios.average.steps) {
      const row = result.credits[step.creditIndex];
      row.firstCycleStatus = row.status;
      row.projectedLowAt = step.checkAt;
      row.planningStatus = step.status;
      if (result.timeline.reliable) {
        if (step.status === 'conditional_check') {
          if (!['consider_manual', 'save_until_needed'].includes(row.status)) row.status = 'watch_before_expiry';
        } else if (step.status === 'not_needed_before_expiry') {
          const sensitive = ['faster', 'todayAdjusted'].some(key => result.timeline.scenarios[key].steps.some(s => s.creditIndex === step.creditIndex && s.checkAt !== null));
          row.status = sensitive ? 'pace_sensitive' : 'expiry_risk';
        } else if (step.status === 'reassess_after_natural') {
          row.status = row.firstCycleStatus === 'natural_reset_soon' ? 'natural_reset_soon' : 'natural_reset_first';
        } else row.status = step.status;
      }
    }
  }
  if (result.timeline?.reliable) {
    const fast = result.timeline.scenarios.faster;
    const dated = result.credits.filter(c => c.resetType === 'codexRateLimits' && c.expiresAt > now && c.expiresAt <= fast.stopAt);
    for (const expiry of [...new Set(dated.map(c => c.expiresAt))]) {
      const dueCount = dated.filter(c => c.expiresAt <= expiry).length;
      if (dueCount < 2) continue;
      const upperUses = fast.steps.filter(s => s.expiresAt <= expiry && s.checkAt !== null).length;
      if (upperUses < dueCount) result.expiryPressure.push({ expiresAt: expiry, knownCreditsDue: dueCount,
        optimisticUseCount: upperUses, potentiallyUnused: dueCount - upperUses,
        assumptions: 'Faster-pace sequential scenario, not a guaranteed waste count. Full refill to 100%, 10% trigger; one credit per shared opportunity. Only deadlines before the first natural refresh are assessed.' });
    }
  }
  if (result.expiryPressure.length) result.notes.push('Several credits may expire unused in the modeled scenario. Do not create unnecessary work merely to spend them.');
  result.recheckAt = result.credits.reduce((at, row) => row.recheckAt === null ? at : Math.min(at, row.recheckAt), Infinity);
  if (!Number.isFinite(result.recheckAt)) result.recheckAt = null;
  const states = new Set(result.credits.map(c => c.status));
  if (states.has('consider_manual')) return finish('consider_manual', 'Consider a manual reset before the credit expires', 'Core quota is at or below 10% and a credit expires within 72 hours. If you still need useful work, check eligibility in Codex and consider the earliest-expiring compatible credit.');
  if (states.has('natural_reset_soon')) return finish('wait_natural_reset', 'The natural reset is close', 'The low window(s) refresh within 6 hours and the expiring credit survives that refresh. Waiting may avoid an unnecessary reset; re-check afterward.');
  if (result.timeline?.reliable && result.timeline.scenarios.average.steps.some(s => s.checkAt !== null)) return finish('watch', 'Plan sequential reset checks before expiry', 'There is a conditional low-quota opportunity before expiry. Later credits are evaluated after earlier hypothetical refills, not against the same first crossing. Some credits may still expire unused; re-run after each reset.');
  if (result.expiryPressure.length || states.has('expiry_risk')) return finish('expiry_risk', 'Some reset credit may expire unused', 'At the observed pace, there may be little need for the credit before expiry. Schedule useful work if needed and re-check; do not reset a healthy quota just to spend a credit.');
  if (states.has('watch_before_expiry')) return finish('watch', 'Plan a reset check before expiry', 'Average quota pace reaches the advisory 10% threshold before a credit expires and before the natural reset. Re-check then; eligibility is not confirmed.');
  if (states.has('pace_sensitive')) return finish('watch', 'A busier day could change reset timing', 'Today or the higher observed pace could reach low quota before expiry. This is a sensitivity scenario, not a reason to reset now.');
  if (states.has('natural_reset_first')) return finish('wait_natural_reset', 'Reassess after the natural reset', 'The natural window refreshes before expiry and no low-quota crossing was projected before that refresh. The next cycle cannot be predicted reliably from this one.');
  if (states.has('limited_evidence')) return finish('unknown', 'More quota history is needed for reset timing', 'An expiry date is known, but sparse or fallback pace cannot establish how much work remains before it.');
  if (states.has('save_until_needed')) return finish('hold', 'Keep the reset available for needed work', 'Quota is low, but no exposed compatible credit is near expiry. Consider a manual reset only if needed to continue useful work.');
  if (states.has('expired') && result.credits.every(c => c.status === 'expired')) return finish('refresh_required', 'Exposed reset details have expired', 'The available count may include unexposed credits. Refresh to obtain valid details.');
  return finish('unknown', 'No near-term reset timing can be established', 'Expiry details may be missing, outside the seven-day horizon, or for an unknown reset type.');
}
