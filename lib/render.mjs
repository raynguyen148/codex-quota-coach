import { finite, windowLabel, quickStatus } from './analysis.mjs';
import {
  LABELS,
  ascii,
  translateConfidence,
  translateRecommendation,
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
  const riskColor = { danger: '1;37;41', high: '1;30;43', low: '1;33', ok: '1;30;42', unknown: '1;30;47' };
  const actionColor = { use_now: '1;37;41', use_when_low: '1;30;43', monitor: '1;33', wait_natural_reset: '1;36', refresh: '1;33', no_action: '2', hold: '2', later: '2', unavailable: '2', unsupported: '2', unknown_expiry: '2', unknown: '2' };
  const ui = (english, vietnamese) => vn ? vietnamese : english;
  const riskLabel = (risk, label) => vn ? translateRiskLabel(label === 'CACHED / UNKNOWN' ? label : risk) : label;
  const badge = (label, code) => paint(`[ ${label} ]`, code);
  const actionLabel = action => ({
    use_now: ui('USE NOW', 'NÊN DÙNG NGAY'),
    use_when_low: ui('USE WHEN LOW', 'NÊN DÙNG KHI THẤP'),
    monitor: ui('MONITOR', 'THEO DÕI'),
    wait_natural_reset: ui('WAIT FOR NATURAL RESET', 'NÊN CHỜ RESET TỰ NHIÊN'),
    hold: ui('HOLD', 'CHƯA NÊN DÙNG'),
    later: ui('OUTSIDE CURRENT HORIZON', 'NGOÀI PHẠM VI HIỆN TẠI'),
    unavailable: ui('EXPIRED / UNAVAILABLE', 'ĐÃ HẾT HẠN / KHÔNG DÙNG'),
    unsupported: ui('UNSUPPORTED RESET TYPE', 'LOẠI RESET CHƯA HỖ TRỢ'),
    unknown_expiry: ui('EXPIRY UNKNOWN', 'CHƯA RÕ HẠN DÙNG'),
    refresh: ui('REFRESH FIRST', 'CẦN CẬP NHẬT TRƯỚC'),
    no_action: ui('NO ACTION', 'KHÔNG CẦN HÀNH ĐỘNG'),
    unknown: ui('UNKNOWN', 'CHƯA XÁC ĐỊNH'),
  }[action] || ui('UNKNOWN', 'CHƯA XÁC ĐỊNH'));
  const creditRef = (credit, index) => {
    const title = credit?.title && credit.title !== 'Reset credit' ? ` · ${tr(credit.title)}` : '';
    const id = credit?.id ? ` · …${clean(credit.id.slice(-6))}` : '';
    return `${ui('Reset', 'lượt reset')} #${index + 1}${title}${id}`;
  };
  const creditExpiry = credit => credit?.expiresAt ? `${dateText(credit.expiresAt / 1000)} · ${durationText(credit.expiresAt - Date.now())}` : ui('expiry unknown', 'chưa rõ hạn dùng');
  const fallbackCreditAction = status => ({
    consider_manual: 'use_now', natural_reset_soon: 'wait_natural_reset', natural_reset_first: 'wait_natural_reset',
    pace_sensitive: 'monitor', watch_before_expiry: 'monitor', save_until_needed: 'hold', expiry_risk: 'hold',
    limited_evidence: 'hold', beyond_horizon: 'later', expired: 'unavailable', deadline_passed: 'unavailable',
    unknown_type: 'unsupported', unknown_expiry: 'unknown_expiry',
  }[status] || 'unknown');
  const planCredit = (advice, index) => advice?.plan?.credits?.find(item => item.creditIndex === index) || {
    creditIndex: index, action: fallbackCreditAction(advice?.credits?.[index]?.status), checkAt: null, dependsOn: [],
  };
  const resetPlanHeadline = advice => {
    const plan = advice?.plan;
    const index = Number.isInteger(plan?.recommendedCreditIndex) ? plan.recommendedCreditIndex : null;
    const credit = index === null ? null : advice.credits?.[index];
    const item = index === null ? null : planCredit(advice, index);
    if (credit && plan?.action === 'use_now') return ui(`Use ${creditRef(credit, index)} now if you need to continue.`, `Nên dùng ${creditRef(credit, index)} ngay nếu cần tiếp tục công việc.`);
    if (credit && plan?.action === 'use_when_low') return ui(`Use ${creditRef(credit, index)} when quota reaches the low threshold, around ${dateText(item.checkAt / 1000)}.`, `Ưu tiên ${creditRef(credit, index)} khi hạn mức chạm ngưỡng thấp, dự kiến khoảng ${dateText(item.checkAt / 1000)}.`);
    if (plan?.action === 'wait_natural_reset') return plan.nextNaturalResetAt
      ? ui(`Do not use a reset before the natural reset at ${dateText(plan.nextNaturalResetAt / 1000)}.`, `Chưa nên dùng reset trước đợt reset tự nhiên lúc ${dateText(plan.nextNaturalResetAt / 1000)}.`)
      : ui('Wait for the next natural reset, then re-check.', 'Nên chờ đợt reset tự nhiên tiếp theo rồi kiểm tra lại.');
    if (plan?.action === 'monitor') return plan.nextCheckAt
      ? ui(`Do not use a reset now; re-check around ${dateText(plan.nextCheckAt / 1000)} if usage increases.`, `Chưa dùng reset ngay; kiểm tra lại khoảng ${dateText(plan.nextCheckAt / 1000)} nếu nhịp sử dụng tăng.`)
      : ui('Do not use a reset now; monitor usage and re-check.', 'Chưa dùng reset ngay; theo dõi mức sử dụng và kiểm tra lại.');
    if (plan?.action === 'hold') return ui('No reset is needed yet. Keep the earliest-expiring credit available and re-check before its deadline.', 'Chưa cần dùng reset. Giữ lại lượt hết hạn sớm nhất và kiểm tra lại trước hạn.');
    if (plan?.action === 'no_action') return advice?.status === 'none' ? ui('No reset is available to use.', 'Không có lượt reset khả dụng để dùng.') : ui('No reset action is recommended now.', 'Hiện chưa có khuyến nghị dùng reset.');
    if (advice?.detail) return tr(advice.detail);
    return ui('Refresh quota before choosing a reset.', 'Cập nhật hạn mức trước khi chọn lượt reset.');
  };
  const resetCreditDetail = (advice, item, credit) => {
    const natural = advice?.plan?.nextNaturalResetAt;
    if (item.action === 'use_now') return ui('Quota is already low; choose this credit first if work must continue, after checking eligibility.', 'Hạn mức hiện đã thấp; nếu cần tiếp tục, hãy ưu tiên lượt này sau khi kiểm tra điều kiện sử dụng.');
    if (item.action === 'use_when_low') return item.checkAt
      ? ui(`Check/use around ${dateText(item.checkAt / 1000)}; do not spend it earlier without a need.`, `Kiểm tra/dùng khoảng ${dateText(item.checkAt / 1000)}; không nên dùng sớm hơn nếu chưa cần.`)
      : ui('Use it only when the quota reaches the low threshold.', 'Chỉ dùng khi hạn mức chạm ngưỡng thấp.');
    if (item.action === 'monitor') return item.checkAt
      ? ui(`Only consider it if the pace increases; re-check around ${dateText(item.checkAt / 1000)}.`, `Chỉ cân nhắc nếu nhịp sử dụng tăng; kiểm tra lại khoảng ${dateText(item.checkAt / 1000)}.`)
      : ui('Only consider it if usage becomes heavier.', 'Chỉ cân nhắc nếu mức sử dụng trở nên cao hơn.');
    if (item.action === 'wait_natural_reset') return natural && credit?.expiresAt >= natural
      ? ui(`Wait: the natural reset arrives before this credit expires.`, `Nên chờ: đợt reset tự nhiên đến trước khi lượt này hết hạn.`)
      : ui('Do not use it before a fresh quota check.', 'Không nên dùng trước khi cập nhật hạn mức mới.');
    if (item.action === 'hold') return ui('No projected need before expiry; using it now could waste the credit.', 'Chưa dự báo cần dùng trước hạn; dùng ngay có thể làm lãng phí lượt này.');
    if (item.action === 'later') return ui('Outside the current seven-day planning window.', 'Nằm ngoài phạm vi lập kế hoạch bảy ngày hiện tại.');
    if (item.action === 'unavailable') return ui('This credit cannot be selected for a future reset.', 'Không thể chọn lượt này cho lần reset sắp tới.');
    if (item.action === 'unsupported') return ui('The reset type is not confirmed as compatible with the core quota.', 'Chưa xác nhận loại reset này tương thích với hạn mức chính.');
    if (item.action === 'unknown_expiry') return ui('Expiry is not exposed, so it cannot be safely prioritized.', 'Chưa có hạn dùng nên không thể xếp ưu tiên an toàn.');
    return ui('Refresh the account data before choosing this credit.', 'Cập nhật dữ liệu tài khoản trước khi chọn lượt này.');
  };
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
  const forecastSection = () => {
    const entry = analysis?.entries.find(item => item.limitId === quick?.limitId && item.window.label === quick?.window) || analysis?.entries[0];
    heading(ui('FORECAST', 'DỰ BÁO'));
    if (quick) {
      const title = { danger: 'Action needed', high: 'Slow down', low: 'Protect your buffer', ok: 'You are on track', unknown: offline ? 'Refresh before planning' : 'More data needed' }[quick.risk];
      add(`  ${badge(riskLabel(quick.risk, quick.label), riskColor[quick.risk])}  ${paint(tr(title), '1')}`);
      add(`  ${tr(quick.message)}`);
    } else add(`  ${tr('No quota forecast is available.')}`);
    if (entry) {
      const { window: w, burn, forecast: f } = entry;
      field(ui('Quota now', 'Hạn mức hiện tại'), `${entry.limitId}/${windowText(w.label, w.durationMins)} · ${percent(w.remainingPercent)} ${ui('remaining', 'còn lại')}`);
      field(ui('Natural reset', 'Đợt reset tự nhiên'), w.resetsAt ? `${dateText(w.resetsAt)} · ${durationText(w.resetsAt * 1000 - Date.now())}` : ui('not exposed', 'chưa được cung cấp'));
      field(ui('Current pace', 'Nhịp hiện tại'), rateText(burn?.perDay, w));
      field(ui('Safe pace', 'Nhịp nên giữ'), f ? rateText(f.safePerDay, w) : '—');
      if (f?.exhaustionAt) field(ui('Run-out risk', 'Nguy cơ cạn'), dateText(f.exhaustionAt / 1000));
      else if (f) field(ui('At natural reset', 'Còn lại khi reset tự nhiên'), percent(f.projectedRemaining));
      field(ui('Evidence', 'Bằng chứng'), `${confidenceText(burn?.confidence)} ${ui('confidence', 'độ tin cậy')} · ${sourceText(burn?.source)}`);
    }
    heading(ui('CONCLUSION', 'KẾT LUẬN'));
    if (offline) add(`  ${ui('Refresh live quota before making a decision.', 'Cập nhật hạn mức trực tiếp trước khi quyết định.')}`);
    else if (result.resetAdvice?.plan?.action === 'use_now') add(`  ${ui('Quota is low. If work must continue, follow the reset choice below after checking eligibility.', 'Hạn mức đang thấp. Nếu cần tiếp tục, hãy theo lựa chọn reset bên dưới sau khi kiểm tra điều kiện sử dụng.')}`);
    else if (quick?.risk === 'danger') add(`  ${ui('Stop quota-heavy work and wait for the reported reset.', 'Tạm dừng tác vụ tốn nhiều hạn mức và chờ đợt reset được báo cáo.')}`);
    else if (quick?.risk === 'high') add(`  ${ui('Reduce usage to', 'Giảm mức sử dụng xuống')} ${rateText(entry?.forecast?.safePerDay, entry?.window || quick)}.`);
    else if (quick?.risk === 'low') add(`  ${ui('Keep usage near', 'Giữ mức sử dụng gần')} ${rateText(entry?.forecast?.safePerDay, entry?.window || quick)}.`);
    else if (quick?.risk === 'ok') add(`  ${ui('Current usage is safe for now; re-check after heavier work.', 'Mức sử dụng hiện tại đang an toàn; kiểm tra lại sau tác vụ nặng hơn.')}`);
    else add(`  ${ui('Evidence is limited. Stay near the suggested pace and re-check at the end of the session.', 'Bằng chứng còn hạn chế. Giữ gần nhịp đề xuất và kiểm tra lại vào cuối phiên.')}`);
    if (result.resetAdvice) {
      heading(ui('RESET OUTLOOK', 'TỔNG QUAN RESET'));
      add(`  ${resetPlanHeadline(result.resetAdvice)}`);
      if (result.resetAdvice.plan?.recommendedCreditIndex !== null && result.resetAdvice.plan?.recommendedCreditIndex !== undefined) add(`  ${ui('See cq resets for the exact reset choice.', 'Xem cq resets để biết chính xác nên chọn lượt reset nào.')}`);
    }
  };
  const resetSection = () => {
    const a = result.resetAdvice;
    if (!a) return;
    const plan = a.plan || { action: 'refresh', credits: [], recommendedCreditIndex: null };
    const planAction = plan.action || 'unknown';
    heading(ui('RESET DECISION', 'QUYẾT ĐỊNH RESET'));
    add(`  ${badge(actionLabel(planAction), actionColor[planAction] || '2')}`);
    add(`  ${resetPlanHeadline(a)}`);
    if (plan.nextNaturalResetAt) field(ui('Next natural reset', 'Đợt reset tự nhiên tiếp theo'), `${dateText(plan.nextNaturalResetAt / 1000)} · ${durationText(plan.nextNaturalResetAt - Date.now())}`);
    field(ui('Available resets', 'Lượt reset khả dụng'), a.availableCount === null ? ui('unknown', 'chưa rõ') : `${a.availableCount}`);
    if (a.credits?.length) {
      heading(ui('RESET OPTIONS · earliest expiry first', 'CÁC LƯỢT RESET · xếp theo hạn gần nhất'));
      for (const [index, credit] of a.credits.entries()) {
        const item = planCredit(a, index);
        add(`  ${index + 1}. ${badge(actionLabel(item.action), actionColor[item.action] || '2')}`);
        add(`     ${creditRef(credit, index)} · ${ui('expires', 'hết hạn')} ${creditExpiry(credit)}`);
        add(`     ${resetCreditDetail(a, item, credit)}`);
        if (item.dependsOn?.length && ['use_now', 'use_when_low'].includes(item.action)) add(`     ${ui('Depends on reset(s)', 'Phụ thuộc vào lượt reset')} #${item.dependsOn.map(value => value + 1).join(', #')}; ${ui('refresh after each use', 'cập nhật sau mỗi lần dùng')}.`);
      }
    } else if (a.detail) add(`  ${tr(a.detail)}`);
    if (a.notes?.length) {
      heading(ui('NOTES', 'LƯU Ý'));
      for (const note of a.notes) add(`  ${tr(note)}`);
    }
    if (a.credits?.length || a.availableCount > 0) add(`  ${ui('Advice only: confirm eligibility in Codex before using a reset.', 'Chỉ là khuyến nghị: hãy xác nhận điều kiện trong Codex trước khi dùng reset.')}`);
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
    else if (command === 'forecast') forecastSection();
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
