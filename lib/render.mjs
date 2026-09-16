import { finite, HOUR, windowLabel, quickStatus } from './analysis.mjs';
import {
  LABELS,
  ascii,
  translateConfidence,
  translateRecommendation,
  translateResetStatus,
  translateRestriction,
  translateRiskLabel,
  translateSource,
  translateText,
  translateWarning,
  translateWindow,
} from './i18n.mjs';

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
  const vn = options.vn === true;
  const plain = options.plain;
  const colors = process.stdout.isTTY && !plain && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb';
  const paint = (text, code) => colors ? `\x1b[${code}m${text}\x1b[0m` : text;
  const lines = [];
  const width = Math.max(24, Math.min(88, process.stdout.columns || 88));
  const add = (s = '') => lines.push(s);
  const tr = value => vn ? clean(translateText(value)) : clean(value);
  const windowText = (label, durationMins) => vn ? clean(translateWindow(label, durationMins)) : clean(label || windowLabel(durationMins));
  const confidenceText = value => vn ? clean(translateConfidence(value)) : clean(value);
  const sourceText = value => vn ? clean(translateSource(value)) : clean(value);
  const restrictionText = value => vn ? clean(translateRestriction(value)) : clean(value);
  const statusText = value => vn ? clean(translateResetStatus(value)) : clean(value?.replaceAll('_', ' '));
  const dateText = seconds => {
    if (!vn) return date(seconds);
    if (!seconds || !Number.isFinite(seconds) || !Number.isFinite(new Date(seconds * 1000).getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(seconds * 1000));
  };
  const durationText = ms => {
    if (!vn) return duration(ms);
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return 'đã đến hạn';
    const mins = Math.ceil(ms / 60000);
    if (mins >= 1440) return `${Math.floor(mins / 1440)} ngày ${Math.floor(mins % 1440 / 60)} giờ`;
    if (mins >= 60) return `${Math.floor(mins / 60)} giờ ${mins % 60} phút`;
    return `${mins} phút`;
  };
  const rateText = (n, w) => {
    if (!vn) return rate(n, w);
    if (finite(n) === null) return '—';
    const short = w.durationMins && w.durationMins <= 1440;
    const value = short ? n / 24 : n;
    return `${Number(value.toFixed(1))} điểm/${short ? 'giờ' : 'ngày'}`;
  };
  const displayRecommendation = vn ? translateRecommendation(recommendation) : recommendation;
  const heading = s => { add(); add(paint(vn ? LABELS[s.toLowerCase()] || tr(s) : s, '1')); };
  const field = (label, value) => add(`  ${tr(label).padEnd(15)} ${tr(value)}`);
  const accentField = (label, value, code) => add(`  ${tr(label).padEnd(15)} ${paint(tr(value), code)}`);
  const bar = (n, size = Math.min(28, width - 22)) => {
    if (finite(n) === null) return vn ? 'chưa rõ' : 'unknown';
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
    return `${Number(value.toFixed(1))} ${short ? (vn ? 'điểm/giờ' : 'points/hour') : (vn ? 'điểm/ngày' : 'points/day')}`;
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
        add(`  ${windowText(w.label, w.durationMins).padEnd(10)} ${paint(`${percent(w.remainingPercent)} ${vn ? 'còn' : 'left'}`, tone)}  ${paint(bar(w.remainingPercent), tone)}`);
        field('Resets', w.resetsAt ? `${vn ? 'trong' : 'in'} ${durationText(w.resetsAt * 1000 - Date.now())} · ${dateText(w.resetsAt)}` : 'Not exposed');
      }
      if (bucket.spendControlReached === true || bucket.rateLimitReachedType) {
        accentField('Restriction', restrictionText(bucket.rateLimitReachedType || 'Spend control reached'), '1;31');
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
      add(`  ${paint(` ${vn ? translateRiskLabel(quick.risk) : quick.label} `, riskColor[quick.risk])}  ${paint(tr(title), '1')}`);
      add(`  ${tr(quick.message)}`);
    }
    quotaSection();
    if (quick) {
      heading('PACE');
      accentField('Current', pace(quick.perDay, quick), quick.risk === 'danger' ? '1;31' : ['high', 'low'].includes(quick.risk) ? '1;33' : '1;36');
      accentField('Safe target', pace(quick.safePerDay, quick), '1;36');
      if (quick.aboveBudgetPercent > 0) accentField('Trend', `${Math.ceil(quick.aboveBudgetPercent)}% ${vn ? 'vượt mục tiêu' : 'over target'} · ${confidenceText(quick.confidence)} ${vn ? 'độ tin cậy' : 'confidence'}`, quick.risk === 'danger' ? '1;31' : '1;33');
      else if (quick.safePerDay === 0 && quick.perDay > 0) accentField('Trend', 'No buffer-preserving target remains', '1;31');
      else field('Trend', quick.risk === 'unknown' ? `${confidenceText(quick.confidence)} ${vn ? 'độ tin cậy' : 'confidence'}` : `${vn ? 'Trong mục tiêu' : 'Within target'} · ${confidenceText(quick.confidence)} ${vn ? 'độ tin cậy' : 'confidence'}`);
    }
    heading('ADVICE');
    const limiting = analysis?.entries.find(entry => entry.limitId === quick?.limitId && entry.window.label === quick?.window);
    if (offline) add(`  ${tr('Refresh with cq before deciding how much quota to use.')}`);
    else if (quick?.risk === 'danger') add(`  ${tr('Pause quota-heavy work and refresh after the reported reset.')}`);
    else if (['high', 'low'].includes(quick?.risk) && finite(quick.safePerDay) !== null) {
      add(`  ${vn ? 'Giữ mức sử dụng khoảng' : 'Keep usage near'} ${pace(quick.safePerDay, quick)}${limiting?.window.resetsAt ? ` ${vn ? 'đến' : 'until'} ${dateText(limiting.window.resetsAt)}` : ''}.`);
    } else if (quick?.risk === 'ok') add(`  ${tr('Keep your current pace. Re-check after heavier work.')}`);
    else add(`  ${tr('Check again at the end of your work session to improve the advice.')}`);
    if (!offline && recommendation?.conditionalOnManualReset) {
      if (result.resetAdvice?.status === 'consider_manual') add(`  ${tr('If work cannot wait, check manual-reset eligibility in Codex now.')}`);
      else if (recommendation.checkAt) add(`  ${vn ? 'Nếu cần, hãy kiểm tra điều kiện đặt lại thủ công khoảng' : 'If needed, check manual-reset eligibility around'} ${dateText(recommendation.checkAt / 1000)}.`);
    }
    const available = normalized?.resetCredits?.availableCount;
    if (Number.isInteger(available) && available > 0) {
      const next = result.resetAdvice?.credits?.filter(c => c.expiresAt > Date.now() && c.resetType === 'codexRateLimits')
        .sort((a, b) => a.expiresAt - b.expiresAt)[0];
      field('Manual resets', offline
        ? `${available} ${vn ? 'trong ảnh chụp đã lưu' : 'in saved snapshot'}`
        : `${available} ${vn ? 'khả dụng' : 'available'}${next ? ` · ${vn ? 'lượt tiếp theo hết hạn sau' : 'next expires in'} ${durationText(next.expiresAt - Date.now())}` : ''}`);
    }
  };
  const quickSection = () => {
    if (!quick) return;
    add();
    add(`  ${paint(` ${vn ? translateRiskLabel(quick.risk) : quick.label} `, riskColor[quick.risk])}`);
    add(`  ${tr(quick.message)}`);
    if (quick.limitId) field('Risk basis', `${quick.limitId} / ${windowText(quick.window, quick.durationMins)} · ${vn ? 'không đặt lại thủ công' : 'without manual reset'}`);
    add(`  ${paint(`${vn ? 'NHỊP SỬ DỤNG' : 'PACE'}  ${rateText(quick.perDay, quick)}`, '1;36')}`);
    field('Budget', `${rateText(quick.safePerDay, quick)} · ${vn ? 'không đặt lại' : 'without reset'}`);
    if (quick.aboveBudgetPercent > 0) field('Pace vs budget', `${Math.ceil(quick.aboveBudgetPercent)}% ${vn ? 'vượt ngân sách' : 'above budget'}`);
    else if (quick.safePerDay === 0 && quick.perDay > 0) field('Pace vs budget', 'No buffer-preserving budget remains');
    field('Evidence', `${confidenceText(quick.confidence)} ${vn ? 'độ tin cậy' : 'confidence'} · ${sourceText(quick.source)}`);
    add(`  ${paint(vn ? 'VIỆC CẦN LÀM' : 'DO NOW', '1')}`);
    if (offline) add(`  ${tr('Run cq online to refresh quota and advice.')}`);
    else if (recommendation?.conditionalOnManualReset) {
      if (result.resetAdvice?.status === 'consider_manual') add(`  ${tr('For needed work, check manual-reset eligibility in Codex now.')}`);
      else add(`  ${vn ? 'Tạm giữ theo ngân sách không đặt lại; kiểm tra tuỳ chọn đặt lại' : 'Keep to the no-reset budget for now; check the reset option'} ${dateText(recommendation.checkAt / 1000)}.`);
      add(`  ${tr('A banked reset does not lower current risk until used. Re-run cq afterward.')}`);
    } else if (quick.risk === 'unknown') add(`  ${tr('Re-check at the end of your work session; use the budget as a provisional guide.')}`);
    else add(`  ${tr(displayRecommendation?.detail || 'Refresh quota before continuing.')}`);
  };
  const resetAdviceSection = (detailed = false) => {
    const a = result.resetAdvice;
    if (!a) return;
    heading('RESET COACH · advice only');
    add(`  ${paint(tr(a.title), ['consider_manual', 'expiry_risk'].includes(a.status) ? '33' : '0')}`);
    add(`  ${tr(a.detail)}`);
    const next = a.credits.find(c => c.expiresAt > Date.now() && c.resetType === 'codexRateLimits');
    if (next) field('Next expiry', `${dateText(next.expiresAt / 1000)} · ${durationText(next.expiresAt - Date.now())}`);
    const nextCheck = a.timeline?.scenarios.average.steps.find(s => s.checkAt !== null);
    if (nextCheck && a.timeline.reliable) field('Scenario check', `${dateText(nextCheck.checkAt / 1000)} · ${vn ? 'có điều kiện, không phải lịch đặt trước' : 'conditional, not a reservation'}`);
    if (a.recheckAt !== null) field('Re-check', a.recheckAt <= Date.now() ? 'Now, before expiry' : dateText(a.recheckAt / 1000));
    for (const w of a.windows) {
      if (!detailed && w.durationMins !== 10080 && a.windows.some(x => x.durationMins === 10080)) continue;
      field(`${windowText(w.label, w.durationMins)} ${vn ? 'hôm nay' : 'today'}`, w.today.usedPoints === null ? 'No within-day comparison yet' : `${Number(w.today.usedPoints.toFixed(1))} ${vn ? 'điểm được quan sát trong' : 'pp observed over'} ${Number(w.today.observedHours.toFixed(1))}${vn ? ' giờ' : 'h'}`);
      if (detailed) {
        field('Day coverage', `${Math.round(w.today.coverage * 100)}% ${vn ? 'từ nửa đêm địa phương' : 'since local midnight'} · ${w.today.date} · ${w.today.timezone}`);
        field('Average pace', `${rateText(w.averagePerDay, w)} · ${confidenceText(w.confidence)} ${vn ? 'độ tin cậy' : 'confidence'}`);
        field('Pace source', sourceText(w.source));
        field('Today pace', rateText(w.today.perDay, w));
        field('Natural reset', dateText(w.naturalResetAt / 1000));
        field('10% at average', w.lowQuotaAt.average === null ? 'Unknown' : `${dateText(w.lowQuotaAt.average / 1000)}${w.lowQuotaAt.average >= w.naturalResetAt ? ` · ${vn ? 'sau lần đặt lại tự nhiên; không phải dự báo có thể dùng' : 'beyond natural reset; not a usable forecast'}` : ''}`);
        if (w.today.discontinuities) field('Data gaps', `${w.today.discontinuities} ${vn ? 'điểm giao giữa đặt lại/điều chỉnh/cửa sổ thiếu bị loại' : 'reset/correction/missing-window boundary(s) excluded'}`);
      }
    }
    if (a.windows.length) add(`  ${tr('Today counts observed quota only; missing time is unknown. Tokens are not used.')}`);
    if (detailed) {
      for (const c of a.credits) field(c.expiresAt ? dateText(c.expiresAt / 1000) : 'Expiry unknown', statusText(a.timeline?.reliable ? c.planningStatus || c.status : c.status));
      if (a.timeline) {
        heading('RESET TIMELINE · conditional scenario');
        add(`  ${tr(a.timeline.assumptions)}`);
        if (!a.timeline.reliable) add(`  ${tr('Low-confidence illustration only; not a timing recommendation.')}`);
        for (const s of a.timeline.scenarios.average.steps) {
          field(`${vn ? 'Lượt đặt lại' : 'Credit'} ${s.creditIndex + 1}`, `${vn ? 'hết hạn' : 'expires'} ${dateText(s.expiresAt / 1000)}`);
          field('Average pace', s.checkAt === null ? statusText(s.status) : `${vn ? 'kiểm tra' : 'check'} ${dateText(s.checkAt / 1000)}`);
          if (s.dependsOn.length && s.status !== 'beyond_horizon') field('Depends on', `${vn ? 'việc dùng thủ công lượt đặt lại' : 'manual use of credit(s)'} ${s.dependsOn.map(i => i + 1).join(', ')}; ${vn ? 'cập nhật sau mỗi lần' : 'refresh after each'}`);
          for (const [key, label] of [['slower', 'Slower pace'], ['faster', 'Faster / today']]) {
            const other = a.timeline.scenarios[key].steps.find(x => x.creditIndex === s.creditIndex);
            field(label, other.checkAt === null ? statusText(other.status) : `${vn ? 'kiểm tra' : 'check'} ${dateText(other.checkAt / 1000)}`);
          }
        }
        field('Reassess by', dateText(a.timeline.scenarios.average.stopAt / 1000));
      }
      for (const p of a.expiryPressure) {
        field('Expiry pressure', `${p.knownCreditsDue} ${vn ? 'lượt đã biết hết hạn' : 'known credits due'} ${dateText(p.expiresAt / 1000)}; ${vn ? 'khoảng' : 'about'} ${p.potentiallyUnused} ${vn ? 'lượt có thể chưa dùng trong kịch bản' : 'may remain unused in the scenario'}`);
        add(`  ${tr(p.assumptions)}`);
      }
      for (const note of a.notes) add(`  ${tr(note)}`);
      add(`  ${tr(a.eligibility)}`);
      add(`  ${vn ? 'Thời điểm kiểm tra lại chỉ là gợi ý khi chạy cq; không cài lịch thông báo.' : 'Re-check times are suggestions when running cq; no notification schedule is installed.'}`);
    } else {
      if (a.expiryPressure.length) field('Expiry pressure', 'Multiple credits may expire unused · cq resets for the scenario');
      if (a.notes.length) add(`  ${tr('Some expiry/history details are limited. See cq resets for evidence.')}`);
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
      for (const row of rows) field(vn && (!row.title || row.title === 'Reset') ? 'Đặt lại' : (row.title || 'Reset'), row.expiresAt ? `${dateText(row.expiresAt)} · ${durationText(row.expiresAt * 1000 - Date.now())}` : 'Expiry not exposed');
      if (rows.length < (reset.availableCount || 0)) field('Details', `${rows.length} ${vn ? 'trong' : 'of'} ${reset.availableCount} ${vn ? 'lượt được cung cấp' : 'credits exposed'}`);
    }
  };
  const activitySection = () => {
    heading('ACCOUNT ACTIVITY · tokens');
    if (!usage) { field('Availability', 'Not available'); return; }
    const s = usage.summary || {};
    field('Lifetime', number(s.lifetimeTokens));
    field('Peak day', number(s.peakDailyTokens));
    field('Streak', `${s.currentStreakDays ?? '—'} ${vn ? 'ngày' : 'days'} · ${vn ? 'dài nhất' : 'longest'} ${s.longestStreakDays ?? '—'} ${vn ? 'ngày' : 'days'}`);
    if (command === 'usage') field('Longest turn', finite(s.longestRunningTurnSec) === null ? '—' : durationText(s.longestRunningTurnSec * 1000));
    if (activity) {
      field('Date range', `${activity.start} → ${activity.end}`);
      field('Reported total', `${number(activity.totalTokens)} · ${activity.reportedDays}/${activity.days} ${vn ? 'ngày được báo cáo' : 'days reported'}`);
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
      if (activity.missingDays) add(`  ${activity.missingDays} ${vn ? 'ngày thiếu chưa rõ, không phải 0.' : 'missing day(s) are unknown, not zero.'}`);
    }
    add(`  ${tr('Backend dates; timezone unspecified. Tokens do not convert to quota %.')}`);
    if (usage.threadUsage) {
      heading('TASK ACTIVITY · backend estimates');
      for (const g of usage.threadUsage.groups || []) {
        add(`  ${vn ? tr(g.model || 'Unknown model') : clean(g.model || 'Unknown model')} · ${vn ? tr(g.reasoningEffort || 'unknown effort') : clean(g.reasoningEffort || 'unknown effort')} · ${vn ? tr(g.speed || 'default speed') : clean(g.speed || 'default speed')}`);
        field('Tokens', `${number(g.totalTokens)} ${vn ? 'tổng' : 'total'} · ${number(g.inputTokens)} ${vn ? 'đầu vào' : 'input'} · ${number(g.outputTokens)} ${vn ? 'đầu ra' : 'output'}`);
        field('Cached input', number(g.cachedInputTokens));
        field('New input', number(g.netNewInputTokens));
      }
      add(`  ${tr('Credit/USD estimates are preserved in --json; no charge is inferred.')}`);
    } else if (options.threadId) field('Task detail', 'No task estimate returned by the backend');
  };

  if (options.compact) {
    const parts = [];
    if (quick) parts.push(`${offline ? (vn ? 'ĐÃ LƯU ' : 'CACHED ') : ''}[${vn ? translateRiskLabel(quick.risk) : quick.label}]`);
    parts.push(...visibleBuckets(normalized?.buckets).flatMap(b => b.windows.map(w => `${b.limitId}/${windowText(w.label, w.durationMins)} ${percent(w.remainingPercent)} ${vn ? 'còn' : 'left'}, ${vn ? 'đặt lại' : 'resets'} ${dateText(w.resetsAt)}`)));
    if (quick) parts.push(`${vn ? 'Nhịp' : 'Pace'} ${rateText(quick.perDay, quick)}, ${vn ? 'mục tiêu' : 'target'} ${rateText(quick.safePerDay, quick)}`);
    if (normalized?.ordinaryUsageAllowed === false) parts.push(vn ? 'QUYỀN DÙNG GÓI ĐI KÈM BỊ CHẶN' : 'INCLUDED USAGE BLOCKED');
    if (result.resetAdvice?.status === 'consider_manual') parts.push(vn ? 'Khuyến nghị: nếu cần, kiểm tra đặt lại thủ công ngay' : 'Advice: check a manual reset now if needed');
    else if (recommendation?.conditionalOnManualReset && recommendation.checkAt) parts.push(`${vn ? 'Khuyến nghị: kiểm tra đặt lại thủ công khoảng' : 'Advice: check a manual reset around'} ${dateText(recommendation.checkAt / 1000)} ${vn ? 'nếu cần' : 'if needed'}`);
    else if (recommendation) parts.push(`${vn ? 'Khuyến nghị' : 'Advice'}: ${tr(displayRecommendation.title)}`);
    add(parts.join(' | '));
  } else {
    add(paint(LABELS.title, '1'));
    add(`${command === 'history' ? (vn ? LABELS.localHistory : 'Local history') : offline ? (vn ? LABELS.cached : 'CACHED') : (vn ? LABELS.live : 'Live')} · ${dateText(Date.parse(capturedAt) / 1000)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    if (offline && command !== 'history') add(`${vn ? 'Tuổi ảnh chụp' : 'Snapshot age'}: ${durationText(Date.now() - Date.parse(capturedAt))}. ${vn ? 'Không kiểm tra tài khoản trực tiếp.' : 'No live account check.'}`);
    if (command === 'overview') overviewSection();
    else if (command === 'forecast') quickSection();
    if (command === 'status') quotaSection();
    else if (command === 'usage') activitySection();
    else if (command === 'resets') resetSection();
    else if (command === 'doctor') {
      heading('DIAGNOSTICS');
      for (const check of result.checks || []) field(check.name, check.detail);
    } else if (command === 'history') {
      heading(vn ? `LỊCH SỬ CỤC BỘ · ${result.history.length} ảnh chụp` : `LOCAL HISTORY · ${result.history.length} snapshots`);
      for (const h of result.history) {
        const buckets = visibleBuckets(h.buckets || [{ limitId: h.limitId || 'codex', windows: h.windows || [] }]);
        add(`  ${dateText(Date.parse(h.capturedAt) / 1000)}${h.accountId ? ` · ${vn ? 'tài khoản' : 'account'} …${clean(h.accountId.slice(-6))}` : ` · ${vn ? 'tài khoản chưa rõ' : 'account unknown'}`}`);
        for (const b of buckets) add(`    ${clean(b.limitId)}  ${b.windows.map(w => `${windowText(w.label || windowLabel(w.durationMins), w.durationMins)} ${percent(w.remainingPercent)} ${vn ? 'còn' : 'left'}`).join(' · ')}`);
      }
      if (!result.history.length) add(`  ${tr('No snapshots in this range. Run cq to collect one.')}`);
    } else if (command !== 'overview') {
      if (analysis && command !== 'status') {
        const r = displayRecommendation;
        if (command === 'forecast') {
          heading('STRATEGY');
          add(`  ${paint(tr(r.title), levelColor[r.level] || '0')}`);
          add(`  ${tr(r.detail)}`);
          if (r.limitId) field('Based on', `${r.limitId} / ${windowText(r.window, r.durationMins)}`);
        }
      }
      for (const bucket of visibleBuckets(normalized?.buckets)) {
        heading(`${clean(bucket.limitName || bucket.limitId)}${bucket.planType ? ` · ${clean(bucket.planType)}` : ''}`);
        if (bucket.normalModelSlug) field('Model', bucket.normalModelSlug);
        if (bucket.spendControlReached === true || bucket.rateLimitReachedType) field('Restriction', restrictionText(bucket.rateLimitReachedType || 'Spend control reached'));
        if (!bucket.windows.length) field('Quota windows', 'Not returned');
        const secondaryOverview = command === 'overview' && bucket.limitId !== 'codex' && normalized.buckets.some(b => b.limitId === 'codex');
        for (const w of bucket.windows) {
          if (secondaryOverview) {
            field(windowText(w.label, w.durationMins), `${percent(w.remainingPercent)} ${vn ? 'còn' : 'left'} · ${vn ? 'đặt lại' : 'resets'} ${dateText(w.resetsAt)}`);
            continue;
          }
          const entry = analysis?.entries.find(e => e.limitId === bucket.limitId && e.window.slot === w.slot);
          add(`  ${windowText(w.label, w.durationMins)}  ${paint(`${percent(w.remainingPercent)} ${vn ? 'còn lại' : 'remaining'}`, finite(w.remainingPercent) === null ? '2' : w.remainingPercent <= 10 ? '31' : '32')}`);
          add(`  ${bar(w.remainingPercent)}`);
          field('Resets', w.resetsAt ? `${dateText(w.resetsAt)} · ${durationText(w.resetsAt * 1000 - Date.now())}` : 'Not exposed');
          if (command !== 'status' && entry) {
            const { burn, forecast: f } = entry;
            field('Recent pace', `${rateText(burn.perDay, w)} · ${confidenceText(burn.confidence)} ${vn ? 'độ tin cậy' : 'confidence'}`);
            field('Without reset', f ? `${rateText(f.safePerDay, w)} · ${vn ? 'giữ lại' : 'retain'} ${f.reserve}% ${vn ? 'phần đệm' : 'buffer'}` : 'Unavailable');
            if (command === 'forecast') add(`  ${tr('The following quota projections assume no manual reset.')}`);
            if (f?.exhaustionAt) field('May run out', dateText(f.exhaustionAt / 1000));
            else field('Left at reset', percent(f?.projectedRemaining));
            if (command === 'forecast') {
              field('Evidence', `${sourceText(burn.source)} · ${Number(burn.sampleHours.toFixed(1))}${vn ? ' giờ đã quan sát' : 'h observed'}`);
              for (const t of burn.trends) field(`${t.days === 1 ? '24h' : t.days + (vn ? ' ngày' : '-day')} ${vn ? 'trung bình' : 'average'}`, `${rateText(t.perDay, w)} · ${Math.round(t.coverage * 100)}% ${vn ? 'độ phủ' : 'coverage'}`);
              field('Pace range', finite(burn.lowPerDay) === null ? 'Unavailable' : `${rateText(burn.lowPerDay, w)} – ${rateText(burn.highPerDay, w)}`);
              field('Reset range', f?.projectedLow == null ? 'Unavailable' : `${percent(f.projectedLow)} – ${percent(f.projectedHigh)} ${vn ? 'còn lại' : 'left'}`);
              field('No-buffer cap', rateText(f?.sustainablePerDay, w));
              if (entry.recommendation.level === 'surplus') field('Extra headroom', rateText(f?.extraPerDay, w));
              field('No-reset advice', vn ? translateRecommendation(entry.recommendation).title : entry.recommendation.title);
            }
          }
          add();
        }
        if (bucket.credits) field('Workspace credit', bucket.credits.unlimited ? 'Unlimited' : bucket.credits.balance ?? 'Balance not exposed');
        if (bucket.individualLimit) field('Spend allowance', `${percent(bucket.individualLimit.remainingPercent)} ${vn ? 'còn' : 'left'} · ${vn ? 'đặt lại' : 'resets'} ${dateText(bucket.individualLimit.resetsAt)}`);
      }
      if (normalized?.ordinaryUsageAllowed !== undefined) field('Included usage', normalized.ordinaryUsageAllowed === null ? 'Permission not exposed' : normalized.ordinaryUsageAllowed ? 'Allowed by service' : 'Blocked by service');
      if (command === 'overview') {
        if (normalized?.resetCredits) field('Banked resets', `${vn ? tr(normalized.resetCredits.availableCount ?? 'Unknown') : (normalized.resetCredits.availableCount ?? 'Unknown')} · ${vn ? 'xem cq resets để biết hạn' : 'cq resets for expiry'}`);
        if (usage) {
          const latest = usage.dailyUsageBuckets?.at(-1);
          if (latest) field('Latest activity', `${number(latest.tokens)} ${vn ? 'token vào' : 'tokens on'} ${latest.startDate} · cq usage`);
        }
      }
      if (command !== 'status') add(`  ${tr('pp = percentage points of that quota; budgets do not carry over after reset.')}`);
      if (command === 'forecast') add(`  ${tr('Ranges show pace sensitivity, not guaranteed outcomes. Re-check after heavy work.')}`);
      if (command === 'forecast') resetAdviceSection(true);
    }
  }
  if (warnings.length) { heading('NOTES'); for (const warning of warnings) add(`  ${vn ? translateWarning(warning) : clean(warning)}`); }
  if (!options.compact && !['history', 'doctor'].includes(command)) {
    add(); add(paint(command === 'overview' ? (vn ? 'Chi tiết: cq forecast  ·  cq resets' : 'Details: cq forecast  ·  cq resets') : 'cq  ·  cq forecast  ·  cq resets  ·  cq usage --days 7', '2'));
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
  if (plain) output = ascii(output.replaceAll(' — ', ' - ').replaceAll('—', 'n/a').replaceAll('–', '-').replaceAll('·', '|').replaceAll('→', 'to').replaceAll('…', '...'));
  return output + '\n';
}
