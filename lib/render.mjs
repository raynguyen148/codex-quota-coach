import { finite, HOUR, windowLabel, quickStatus } from './analysis.mjs';

// Service-owned names/errors must never inject terminal control sequences.
export const clean = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
export const percent = n => finite(n) === null ? '—' : `${Number(n.toFixed(1))}%`;
export const number = n => finite(n) === null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const exact = n => finite(n) === null ? '—' : new Intl.NumberFormat('en').format(n);
export const rate = (n, w) => finite(n) === null ? '—' : `${Number((w.durationMins && w.durationMins <= 1440 ? n / 24 : n).toFixed(1))} pp/${w.durationMins && w.durationMins <= 1440 ? 'hour' : 'day'}`;
export function date(seconds) {
  if (!seconds || !Number.isFinite(seconds) || !Number.isFinite(new Date(seconds * 1000).getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(seconds * 1000));
}
export function duration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'due';
  const mins = Math.ceil(ms / 60000);
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d ${Math.floor(mins % 1440 / 60)}h`;
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
}

export function render(result, options = {}) {
  const { command, normalized, analysis, activity, usage, warnings = [], offline, capturedAt } = result;
  const recommendation = result.recommendation || analysis?.recommendation;
  const quick = result.quickStatus || (analysis ? quickStatus(analysis, { offline }) : null);
  const plain = options.plain;
  const colors = process.stdout.isTTY && !plain && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb';
  const paint = (text, code) => colors ? `\x1b[${code}m${text}\x1b[0m` : text;
  const lines = [];
  const width = Math.max(24, Math.min(88, process.stdout.columns || 88));
  const add = (s = '') => lines.push(s);
  const heading = s => { add(); add(paint(s, '1')); };
  const field = (label, value) => add(`  ${label.padEnd(15)} ${clean(value)}`);
  const accentField = (label, value, code) => add(`  ${label.padEnd(15)} ${paint(clean(value), code)}`);
  const bar = (n, size = Math.min(28, width - 22)) => {
    if (finite(n) === null) return 'unknown';
    const filled = Math.round(Math.max(0, Math.min(100, n)) / 100 * size);
    return (plain ? '#' : '━').repeat(filled) + (plain ? '.' : '─').repeat(size - filled);
  };
  const levelColor = { critical: '31', tight: '33', unknown: '33', balanced: '32', surplus: '36' };
  const riskColor = { danger: '1;37;41', high: '1;30;43', low: '1;33', ok: '1;30;42', unknown: '1;30;47' };
  const visibleBuckets = buckets => {
    const rows = buckets || [];
    if (options.limitId) return rows;
    const core = rows.filter(bucket => bucket.limitId === 'codex');
    return core.length ? core : rows;
  };
  const pace = (n, w) => {
    if (finite(n) === null) return '—';
    const short = w.durationMins && w.durationMins <= 1440;
    const value = short ? n / 24 : n;
    return `${Number(value.toFixed(1))} points/${short ? 'hour' : 'day'}`;
  };
  const quotaTone = remaining => finite(remaining) === null ? '2' : remaining <= 10 ? '1;31' : remaining <= 25 ? '1;33' : '1;32';
  const quotaSection = () => {
    const buckets = visibleBuckets(normalized?.buckets);
    heading('QUOTA');
    if (!buckets.length) { field('Availability', 'No quota windows returned'); return; }
    for (const bucket of buckets) {
      if (buckets.length > 1 || options.limitId) add(`  ${paint(clean(bucket.limitName || bucket.limitId), '1')}`);
      if (!bucket.windows.length) field('Availability', 'No quota windows returned');
      for (const w of bucket.windows) {
        const limiting = command === 'overview' && quick?.limitId === bucket.limitId && quick?.window === w.label;
        const tone = limiting ? ({ danger: '1;31', high: '1;33', low: '1;33', ok: '1;32', unknown: '2' }[quick.risk]) : quotaTone(w.remainingPercent);
        add(`  ${clean(w.label).padEnd(10)} ${paint(`${percent(w.remainingPercent)} left`, tone)}  ${paint(bar(w.remainingPercent), tone)}`);
        field('Resets', w.resetsAt ? `in ${duration(w.resetsAt * 1000 - Date.now())} · ${date(w.resetsAt)}` : 'Not exposed');
      }
      if (bucket.spendControlReached === true || bucket.rateLimitReachedType) {
        accentField('Restriction', bucket.rateLimitReachedType || 'Spend control reached', '1;31');
      }
    }
    if (normalized?.ordinaryUsageAllowed === false) accentField('Access', 'Blocked by service', '1;31');
  };
  const overviewSection = () => {
    if (quick) {
      const title = {
        danger: 'Action needed', high: 'Slow down', low: 'Protect your buffer',
        ok: 'You are on track', unknown: offline ? 'Refresh before planning' : 'More data needed',
      }[quick.risk];
      add();
      add(`  ${paint(` ${quick.label} `, riskColor[quick.risk])}  ${paint(title, '1')}`);
      add(`  ${clean(quick.message)}`);
    }
    quotaSection();
    if (quick) {
      heading('PACE');
      accentField('Current', pace(quick.perDay, quick), quick.risk === 'danger' ? '1;31' : ['high', 'low'].includes(quick.risk) ? '1;33' : '1;36');
      accentField('Safe target', pace(quick.safePerDay, quick), '1;36');
      if (quick.aboveBudgetPercent > 0) accentField('Trend', `${Math.ceil(quick.aboveBudgetPercent)}% over target · ${quick.confidence} confidence`, quick.risk === 'danger' ? '1;31' : '1;33');
      else if (quick.safePerDay === 0 && quick.perDay > 0) accentField('Trend', 'No buffer-preserving target remains', '1;31');
      else field('Trend', quick.risk === 'unknown' ? `${quick.confidence} confidence` : `Within target · ${quick.confidence} confidence`);
    }
    heading('ADVICE');
    const limiting = analysis?.entries.find(entry => entry.limitId === quick?.limitId && entry.window.label === quick?.window);
    if (offline) add('  Refresh with cq before deciding how much quota to use.');
    else if (quick?.risk === 'danger') add('  Pause quota-heavy work and refresh after the reported reset.');
    else if (['high', 'low'].includes(quick?.risk) && finite(quick.safePerDay) !== null) {
      add(`  Keep usage near ${pace(quick.safePerDay, quick)}${limiting?.window.resetsAt ? ` until ${date(limiting.window.resetsAt)}` : ''}.`);
    } else if (quick?.risk === 'ok') add('  Keep your current pace. Re-check after heavier work.');
    else add('  Check again at the end of your work session to improve the advice.');
    if (!offline && recommendation?.conditionalOnManualReset) {
      if (result.resetAdvice?.status === 'consider_manual') add('  If work cannot wait, check manual-reset eligibility in Codex now.');
      else if (recommendation.checkAt) add(`  If needed, check manual-reset eligibility around ${date(recommendation.checkAt / 1000)}.`);
    }
    const available = normalized?.resetCredits?.availableCount;
    if (Number.isInteger(available) && available > 0) {
      const next = result.resetAdvice?.credits?.filter(c => c.expiresAt > Date.now() && c.resetType === 'codexRateLimits')
        .sort((a, b) => a.expiresAt - b.expiresAt)[0];
      field('Manual resets', offline ? `${available} in saved snapshot` : `${available} available${next ? ` · next expires in ${duration(next.expiresAt - Date.now())}` : ''}`);
    }
  };
  const quickSection = () => {
    if (!quick) return;
    add();
    add(`  ${paint(` ${quick.label} `, riskColor[quick.risk])}`);
    add(`  ${quick.message}`);
    if (quick.limitId) field('Risk basis', `${quick.limitId} / ${quick.window} · without manual reset`);
    add(`  ${paint(`PACE  ${rate(quick.perDay, quick)}`, '1;36')}`);
    field('Budget', `${rate(quick.safePerDay, quick)} · without reset`);
    if (quick.aboveBudgetPercent > 0) field('Pace vs budget', `${Math.ceil(quick.aboveBudgetPercent)}% above budget`);
    else if (quick.safePerDay === 0 && quick.perDay > 0) field('Pace vs budget', 'No buffer-preserving budget remains');
    field('Evidence', `${quick.confidence} confidence · ${quick.source}`);
    add(`  ${paint('DO NOW', '1')}`);
    if (offline) add('  Run cq online to refresh quota and advice.');
    else if (recommendation?.conditionalOnManualReset) {
      if (result.resetAdvice?.status === 'consider_manual') add('  For needed work, check manual-reset eligibility in Codex now.');
      else add(`  Keep to the no-reset budget for now; check the reset option ${date(recommendation.checkAt / 1000)}.`);
      add('  A banked reset does not lower current risk until used. Re-run cq afterward.');
    } else if (quick.risk === 'unknown') add('  Re-check at the end of your work session; use the budget as a provisional guide.');
    else add(`  ${clean(recommendation?.detail || 'Refresh quota before continuing.')}`);
  };
  const resetAdviceSection = (detailed = false) => {
    const a = result.resetAdvice;
    if (!a) return;
    heading('RESET COACH · advice only');
    add(`  ${paint(clean(a.title), ['consider_manual', 'expiry_risk'].includes(a.status) ? '33' : '0')}`);
    add(`  ${clean(a.detail)}`);
    const next = a.credits.find(c => c.expiresAt > Date.now() && c.resetType === 'codexRateLimits');
    if (next) field('Next expiry', `${date(next.expiresAt / 1000)} · ${duration(next.expiresAt - Date.now())}`);
    const nextCheck = a.timeline?.scenarios.average.steps.find(s => s.checkAt !== null);
    if (nextCheck && a.timeline.reliable) field('Scenario check', `${date(nextCheck.checkAt / 1000)} · conditional, not a reservation`);
    if (a.recheckAt !== null) field('Re-check', a.recheckAt <= Date.now() ? 'Now, before expiry' : date(a.recheckAt / 1000));
    for (const w of a.windows) {
      if (!detailed && w.durationMins !== 10080 && a.windows.some(x => x.durationMins === 10080)) continue;
      field(`${w.label} today`, w.today.usedPoints === null ? 'No within-day comparison yet' : `${Number(w.today.usedPoints.toFixed(1))} pp observed over ${Number(w.today.observedHours.toFixed(1))}h`);
      if (detailed) {
        field('Day coverage', `${Math.round(w.today.coverage * 100)}% since local midnight · ${w.today.date} · ${w.today.timezone}`);
        field('Average pace', `${rate(w.averagePerDay, w)} · ${w.confidence} confidence`);
        field('Pace source', w.source);
        field('Today pace', rate(w.today.perDay, w));
        field('Natural reset', date(w.naturalResetAt / 1000));
        field('10% at average', w.lowQuotaAt.average === null ? 'Unknown' : `${date(w.lowQuotaAt.average / 1000)}${w.lowQuotaAt.average >= w.naturalResetAt ? ' · beyond natural reset; not a usable forecast' : ''}`);
        if (w.today.discontinuities) field('Data gaps', `${w.today.discontinuities} reset/correction/missing-window boundary(s) excluded`);
      }
    }
    if (a.windows.length) add('  Today counts observed quota only; missing time is unknown. Tokens are not used.');
    if (detailed) {
      for (const c of a.credits) field(c.expiresAt ? date(c.expiresAt / 1000) : 'Expiry unknown', (a.timeline?.reliable ? c.planningStatus || c.status : c.status).replaceAll('_', ' '));
      if (a.timeline) {
        heading('RESET TIMELINE · conditional scenario');
        add(`  ${clean(a.timeline.assumptions)}`);
        if (!a.timeline.reliable) add('  Low-confidence illustration only; not a timing recommendation.');
        for (const s of a.timeline.scenarios.average.steps) {
          field(`Credit ${s.creditIndex + 1}`, `expires ${date(s.expiresAt / 1000)}`);
          field('Average pace', s.checkAt === null ? s.status.replaceAll('_', ' ') : `check ${date(s.checkAt / 1000)}`);
          if (s.dependsOn.length && s.status !== 'beyond_horizon') field('Depends on', `manual use of credit(s) ${s.dependsOn.map(i => i + 1).join(', ')}; refresh after each`);
          for (const [key, label] of [['slower', 'Slower pace'], ['faster', 'Faster / today']]) {
            const other = a.timeline.scenarios[key].steps.find(x => x.creditIndex === s.creditIndex);
            field(label, other.checkAt === null ? other.status.replaceAll('_', ' ') : `check ${date(other.checkAt / 1000)}`);
          }
        }
        field('Reassess by', date(a.timeline.scenarios.average.stopAt / 1000));
      }
      for (const p of a.expiryPressure) {
        field('Expiry pressure', `${p.knownCreditsDue} known credits due ${date(p.expiresAt / 1000)}; about ${p.potentiallyUnused} may remain unused in the scenario`);
        add(`  ${clean(p.assumptions)}`);
      }
      for (const note of a.notes) add(`  ${clean(note)}`);
      add(`  ${clean(a.eligibility)}`);
      add('  Re-check times are suggestions when running cq; no notification schedule is installed.');
    } else {
      if (a.expiryPressure.length) field('Expiry pressure', 'Multiple credits may expire unused · cq resets for the scenario');
      if (a.notes.length) add('  Some expiry/history details are limited. See cq resets for evidence.');
    }
  };
  const resetSection = () => {
    resetAdviceSection(true);
    heading('BANKED RESETS · reported inventory');
    const reset = normalized?.resetCredits;
    if (!reset) { field('Availability', 'Not returned by this account'); return; }
    field('Available', reset.availableCount ?? 'Unknown');
    if (reset.credits === null) field('Expiry details', 'Not exposed by the backend');
    else {
      const rows = [...reset.credits].sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity));
      for (const row of rows) field(row.title || 'Reset', row.expiresAt ? `${date(row.expiresAt)} · ${duration(row.expiresAt * 1000 - Date.now())}` : 'Expiry not exposed');
      if (rows.length < (reset.availableCount || 0)) field('Details', `${rows.length} of ${reset.availableCount} credits exposed`);
    }
  };
  const activitySection = () => {
    heading('ACCOUNT ACTIVITY · tokens');
    if (!usage) { field('Availability', 'Not available'); return; }
    const s = usage.summary || {};
    field('Lifetime', number(s.lifetimeTokens));
    field('Peak day', number(s.peakDailyTokens));
    field('Streak', `${s.currentStreakDays ?? '—'} days · longest ${s.longestStreakDays ?? '—'} days`);
    if (command === 'usage') field('Longest turn', finite(s.longestRunningTurnSec) === null ? '—' : duration(s.longestRunningTurnSec * 1000));
    if (activity) {
      field('Date range', `${activity.start} → ${activity.end}`);
      field('Reported total', `${number(activity.totalTokens)} · ${activity.reportedDays}/${activity.days} days reported`);
      field('Latest bucket', activity.latestDate || 'Not exposed');
      if (command === 'usage') {
        const peak = Math.max(1, ...activity.rows.map(r => r.tokens));
        add();
        for (const row of activity.rows) {
          const count = Math.round(row.tokens / peak * Math.max(4, Math.min(26, width - 40)));
          add(`  ${row.startDate}  ${exact(row.tokens).padStart(15)}  ${(plain ? '#' : '█').repeat(count)}`);
        }
        if (!activity.rows.length) field('Daily tokens', 'No buckets returned in this range');
      }
      if (activity.missingDays) add(`  ${activity.missingDays} missing day(s) are unknown, not zero.`);
    }
    add('  Backend dates; timezone unspecified. Tokens do not convert to quota %.');
    if (usage.threadUsage) {
      heading('TASK ACTIVITY · backend estimates');
      for (const g of usage.threadUsage.groups || []) {
        add(`  ${clean(g.model || 'Unknown model')} · ${clean(g.reasoningEffort || 'unknown effort')} · ${clean(g.speed || 'default speed')}`);
        field('Tokens', `${number(g.totalTokens)} total · ${number(g.inputTokens)} input · ${number(g.outputTokens)} output`);
        field('Cached input', number(g.cachedInputTokens));
        field('New input', number(g.netNewInputTokens));
      }
      add('  Credit/USD estimates are preserved in --json; no charge is inferred.');
    } else if (options.threadId) field('Task detail', 'No task estimate returned by the backend');
  };

  if (options.compact) {
    const parts = [];
    if (quick) parts.push(`${offline ? 'CACHED ' : ''}[${quick.label}]`);
    parts.push(...visibleBuckets(normalized?.buckets).flatMap(b => b.windows.map(w => `${b.limitId}/${w.label} ${percent(w.remainingPercent)} left, resets ${date(w.resetsAt)}`)));
    if (quick) parts.push(`Pace ${rate(quick.perDay, quick)}, target ${rate(quick.safePerDay, quick)}`);
    if (normalized?.ordinaryUsageAllowed === false) parts.push('INCLUDED USAGE BLOCKED');
    if (result.resetAdvice?.status === 'consider_manual') parts.push('Advice: check a manual reset now if needed');
    else if (recommendation?.conditionalOnManualReset && recommendation.checkAt) parts.push(`Advice: check a manual reset around ${date(recommendation.checkAt / 1000)} if needed`);
    else if (recommendation) parts.push(`Advice: ${recommendation.title}`);
    add(parts.join(' | '));
  } else {
    add(paint('CODEX QUOTA COACH', '1'));
    add(`${command === 'history' ? 'Local history' : offline ? 'CACHED' : 'Live'} · ${date(Date.parse(capturedAt) / 1000)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    if (offline && command !== 'history') add(`Snapshot age: ${duration(Date.now() - Date.parse(capturedAt))}. No live account check.`);
    if (command === 'overview') overviewSection();
    else if (command === 'forecast') quickSection();
    if (command === 'status') quotaSection();
    else if (command === 'usage') activitySection();
    else if (command === 'resets') resetSection();
    else if (command === 'doctor') {
      heading('DIAGNOSTICS');
      for (const check of result.checks || []) field(check.name, check.detail);
    } else if (command === 'history') {
      heading(`LOCAL HISTORY · ${result.history.length} snapshots`);
      for (const h of result.history) {
        const buckets = visibleBuckets(h.buckets || [{ limitId: h.limitId || 'codex', windows: h.windows || [] }]);
        add(`  ${date(Date.parse(h.capturedAt) / 1000)}${h.accountId ? ` · account …${clean(h.accountId.slice(-6))}` : ' · account unknown'}`);
        for (const b of buckets) add(`    ${clean(b.limitId)}  ${b.windows.map(w => `${clean(w.label || windowLabel(w.durationMins))} ${percent(w.remainingPercent)} left`).join(' · ')}`);
      }
      if (!result.history.length) add('  No snapshots in this range. Run cq to collect one.');
    } else if (command !== 'overview') {
      if (analysis && command !== 'status') {
        const r = recommendation;
        if (command === 'forecast') {
          heading('STRATEGY');
          add(`  ${paint(clean(r.title), levelColor[r.level] || '0')}`);
          add(`  ${clean(r.detail)}`);
          if (r.limitId) field('Based on', `${r.limitId} / ${r.window}`);
        }
      }
      for (const bucket of visibleBuckets(normalized?.buckets)) {
        heading(`${clean(bucket.limitName || bucket.limitId)}${bucket.planType ? ` · ${clean(bucket.planType)}` : ''}`);
        if (bucket.normalModelSlug) field('Model', bucket.normalModelSlug);
        if (bucket.spendControlReached === true || bucket.rateLimitReachedType) field('Restriction', bucket.rateLimitReachedType || 'Spend control reached');
        if (!bucket.windows.length) field('Quota windows', 'Not returned');
        const secondaryOverview = command === 'overview' && bucket.limitId !== 'codex' && normalized.buckets.some(b => b.limitId === 'codex');
        for (const w of bucket.windows) {
          if (secondaryOverview) {
            field(w.label, `${percent(w.remainingPercent)} left · resets ${date(w.resetsAt)}`);
            continue;
          }
          const entry = analysis?.entries.find(e => e.limitId === bucket.limitId && e.window.slot === w.slot);
          add(`  ${clean(w.label)}  ${paint(percent(w.remainingPercent) + ' remaining', finite(w.remainingPercent) === null ? '2' : w.remainingPercent <= 10 ? '31' : '32')}`);
          add(`  ${bar(w.remainingPercent)}`);
          field('Resets', w.resetsAt ? `${date(w.resetsAt)} · ${duration(w.resetsAt * 1000 - Date.now())}` : 'Not exposed');
          if (command !== 'status' && entry) {
            const { burn, forecast: f } = entry;
            field('Recent pace', `${rate(burn.perDay, w)} · ${burn.confidence} confidence`);
            field('Without reset', f ? `${rate(f.safePerDay, w)} · retain ${f.reserve}% buffer` : 'Unavailable');
            if (command === 'forecast') add('  The following quota projections assume no manual reset.');
            if (f?.exhaustionAt) field('May run out', date(f.exhaustionAt / 1000));
            else field('Left at reset', percent(f?.projectedRemaining));
            if (command === 'forecast') {
              field('Evidence', `${burn.source} · ${Number(burn.sampleHours.toFixed(1))}h observed`);
              for (const t of burn.trends) field(`${t.days === 1 ? '24h' : t.days + '-day'} average`, `${rate(t.perDay, w)} · ${Math.round(t.coverage * 100)}% coverage`);
              field('Pace range', finite(burn.lowPerDay) === null ? 'Unavailable' : `${rate(burn.lowPerDay, w)} – ${rate(burn.highPerDay, w)}`);
              field('Reset range', f?.projectedLow == null ? 'Unavailable' : `${percent(f.projectedLow)} – ${percent(f.projectedHigh)} left`);
              field('No-buffer cap', rate(f?.sustainablePerDay, w));
              if (entry.recommendation.level === 'surplus') field('Extra headroom', rate(f?.extraPerDay, w));
              field('No-reset advice', entry.recommendation.title);
            }
          }
          add();
        }
        if (bucket.credits) field('Workspace credit', bucket.credits.unlimited ? 'Unlimited' : bucket.credits.balance ?? 'Balance not exposed');
        if (bucket.individualLimit) field('Spend allowance', `${percent(bucket.individualLimit.remainingPercent)} left · resets ${date(bucket.individualLimit.resetsAt)}`);
      }
      if (normalized?.ordinaryUsageAllowed !== undefined) field('Included usage', normalized.ordinaryUsageAllowed === null ? 'Permission not exposed' : normalized.ordinaryUsageAllowed ? 'Allowed by service' : 'Blocked by service');
      if (command === 'overview') {
        if (normalized?.resetCredits) field('Banked resets', `${normalized.resetCredits.availableCount ?? 'Unknown'} · cq resets for expiry`);
        if (usage) {
          const latest = usage.dailyUsageBuckets?.at(-1);
          if (latest) field('Latest activity', `${number(latest.tokens)} tokens on ${latest.startDate} · cq usage`);
        }
      }
      if (command !== 'status') add('  pp = percentage points of that quota; budgets do not carry over after reset.');
      if (command === 'forecast') add('  Ranges show pace sensitivity, not guaranteed outcomes. Re-check after heavy work.');
      if (command === 'forecast') resetAdviceSection(true);
    }
  }
  if (warnings.length) { heading('NOTES'); for (const warning of warnings) add(`  ${clean(warning)}`); }
  if (!options.compact && !['history', 'doctor'].includes(command)) {
    add(); add(paint(command === 'overview' ? 'Details: cq forecast  ·  cq resets' : 'cq  ·  cq forecast  ·  cq resets  ·  cq usage --days 7', '2'));
  }
  // Soft wrap long prose and service labels without breaking ANSI escape sequences.
  let output = options.compact ? lines.map(line => clean(line)).filter(Boolean).join(' | ') : lines.map(line => {
    if (line.replace(/\x1b\[[0-9;]*m/g, '').length <= width || line.includes('\x1b')) return line;
    const words = line.trim().split(/\s+/), wrapped = [];
    let current = line.startsWith(' ') ? '  ' : '';
    for (const word of words) {
      if (current.trim() && current.length + word.length + 1 > width) { wrapped.push(current); current = '  '; }
      current += (current.trim() ? ' ' : '') + word;
    }
    wrapped.push(current); return wrapped.join('\n');
  }).join('\n');
  if (plain) output = output.replaceAll(' — ', ' - ').replaceAll('—', 'n/a').replaceAll('–', '-').replaceAll('·', '|').replaceAll('→', 'to').replaceAll('…', '...');
  return output + '\n';
}
