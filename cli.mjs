import { spawnSync } from 'node:child_process';
import { VERSION, fetchLive, withClient } from './lib/rpc.mjs';
import { normalizeRateLimits, normalizeUsage, makeSnapshot, snapshotNormalized, analyze, dailyUsage, quickStatus } from './lib/analysis.mjs';
import { loadHistory, saveSnapshot, historyPath } from './lib/storage.mjs';
import { render, clean } from './lib/render.mjs';
import { adviseResets, unifiedRecommendation } from './lib/resets.mjs';
import { ascii, translateError } from './lib/i18n.mjs';

export const HELP = `Codex Quota Coach v${VERSION} · account read-only

Usage: cq [command] [options]

  cq                     Friendly status, core quota, safe pace and advice
  cq status              Current quota only (fast: no activity request)
  cq forecast            Recent pace, 24h/3d/7d coverage, buffer and projections
  cq usage               Account token activity with a daily bar chart
  cq resets              Read-only reset advice, today's quota use and expiry risks
  cq history             Local quota snapshots; no network required
  cq doctor              Check CLI, read RPCs and local history

Options:
  --days N               Calendar days for usage/history (1–3650; default 7)
  --limit ID             Focus on one returned quota bucket
  --reserve N            Quota % to retain at reset (0–50; default 10)
  --compact              One-line quota overview/status
  --offline              Read the latest local snapshot without Codex/network
  --json                 Structured output for every command
  --raw                  Raw quota response, or raw activity with 'usage'
  --no-save              Do not append a quota snapshot
  --plain                Plain output without color or Unicode
  --vn                   Vietnamese human-readable output
  --timeout N            Timeout per RPC in seconds (1–60; default 12)
  --thread ID            Optional backend task breakdown ('usage' only)
  --help, -h             Show help
  --version, -v          Show version

Examples:
  cq status --compact
  cq forecast --reserve 15 --limit codex
  cq usage --days 30
  cq usage --thread TASK_ID --json
  cq history --days 7 --json
  cq --offline

Quota reads use the signed-in Codex app-server (network-backed account reads).
No API key, model inference, reset action, or background server is used.
Only overview/status/forecast save snapshots. --raw never saves.
Token activity is not a conversion to quota % or money. Missing days are unknown.

Environment:
  CODEX_QUOTA_CODEX_BIN   Codex executable (default: codex)
  CODEX_QUOTA_HOME        Override the local history directory
  NO_COLOR               Disable terminal color
`;

export const HELP_VI = `Codex Quota Coach v${VERSION} · chỉ đọc tài khoản

Cách dùng: cq [command] [options]

  cq                     Trạng thái thân thiện, hạn mức chính, nhịp an toàn và khuyến nghị
  cq status              Chỉ xem hạn mức hiện tại (nhanh: không đọc hoạt động)
  cq forecast            Nhịp gần đây, độ phủ 24h/3d/7d, phần đệm và dự báo
  cq usage               Hoạt động token của tài khoản kèm biểu đồ theo ngày
  cq resets              Khuyến nghị đặt lại chỉ đọc, mức dùng hôm nay và nguy cơ hết hạn
  cq history             Ảnh chụp hạn mức cục bộ; không cần mạng
  cq doctor              Kiểm tra CLI, RPC đọc và lịch sử cục bộ

Tuỳ chọn:
  --days N               Số ngày theo lịch cho usage/history (1–3650; mặc định 7)
  --limit ID             Tập trung vào một nhóm hạn mức được trả về
  --reserve N            Phần trăm hạn mức giữ lại khi đặt lại (0–50; mặc định 10)
  --compact              Tổng quan hạn mức/trạng thái trên một dòng
  --offline              Đọc ảnh chụp cục bộ mới nhất, không dùng Codex/mạng
  --json                 Đầu ra có cấu trúc cho mọi lệnh
  --raw                  Phản hồi hạn mức thô, hoặc hoạt động thô với 'usage'
  --no-save              Không thêm ảnh chụp hạn mức
  --plain                Đầu ra không màu, không Unicode
  --vn                   Đầu ra tiếng Việt dành cho người đọc
  --timeout N            Thời gian chờ mỗi RPC tính bằng giây (1–60; mặc định 12)
  --thread ID            Phân tích tuỳ chọn theo tác vụ ở backend (chỉ 'usage')
  --help, -h             Hiển thị trợ giúp
  --version, -v          Hiển thị phiên bản

Ví dụ:
  cq status --compact
  cq forecast --reserve 15 --limit codex
  cq usage --days 30
  cq usage --thread TASK_ID --json
  cq history --days 7 --json
  cq --offline

Việc đọc hạn mức dùng Codex app-server đã đăng nhập (đọc tài khoản qua mạng).
Không dùng API key, suy luận model, thao tác đặt lại hay server chạy nền.
Chỉ overview/status/forecast lưu ảnh chụp. --raw không bao giờ lưu.
Hoạt động token không được quy đổi thành % hạn mức hoặc tiền. Ngày thiếu là chưa rõ.

Môi trường:
  CODEX_QUOTA_CODEX_BIN   Tệp thực thi Codex (mặc định: codex)
  CODEX_QUOTA_HOME        Ghi đè thư mục lịch sử cục bộ
  NO_COLOR                Tắt màu terminal
`;

export function parseArgs(args) {
  const options = { command: 'overview', days: 7, reserve: 10, timeoutMs: 12000 };
  let commandSet = false;
  const seen = new Set();
  const flags = { '--json': 'json', '--raw': 'raw', '--no-save': 'noSave', '--offline': 'offline', '--plain': 'plain', '--vn': 'vn', '--compact': 'compact', '--help': 'help', '-h': 'help', '--version': 'version', '-v': 'version' };
  const values = new Set(['--days', '--reserve', '--limit', '--thread', '--timeout']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags[arg]) { options[flags[arg]] = true; continue; }
    if (values.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      seen.add(arg);
      if (arg === '--limit' || arg === '--thread') {
        if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(value)) throw new Error(`Invalid value for ${arg}.`);
        options[arg === '--limit' ? 'limitId' : 'threadId'] = value;
      } else {
        const n = Number(value);
        const min = arg === '--reserve' ? 0 : 1;
        const max = arg === '--days' ? 3650 : arg === '--reserve' ? 50 : 60;
        if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${arg} must be an integer from ${min} to ${max}.`);
        if (arg === '--timeout') options.timeoutMs = n * 1000;
        else options[arg.slice(2)] = n;
      }
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}. See cq --help.`);
    if (commandSet) throw new Error(`Unexpected argument: ${arg}.`);
    if (!['status', 'forecast', 'usage', 'resets', 'history', 'doctor'].includes(arg)) throw new Error(`Unknown command: ${arg}. See cq --help.`);
    options.command = arg; commandSet = true;
  }
  if (options.help || options.version) return options;
  const cmd = options.command;
  if (options.json && options.raw) throw new Error('Choose --json or --raw.');
  if (options.compact && (options.json || options.raw || !['overview', 'status'].includes(cmd))) throw new Error('--compact is for text overview/status.');
  if (options.raw && (options.offline || ['history', 'doctor'].includes(cmd))) throw new Error('--raw requires a live quota/activity command.');
  if (options.offline && cmd === 'doctor') throw new Error('doctor requires live connectivity; omit --offline.');
  if (options.threadId && (cmd !== 'usage' || options.offline)) throw new Error('--thread is only supported by live usage.');
  if (seen.has('--days') && !['usage', 'history'].includes(cmd)) throw new Error('--days is for usage/history.');
  if (seen.has('--reserve') && !['overview', 'forecast'].includes(cmd)) throw new Error('--reserve is for overview/forecast.');
  if (options.limitId && ['usage', 'resets', 'doctor'].includes(cmd)) throw new Error('--limit is for overview/status/forecast/history.');
  return options;
}

function filterBuckets(normalized, limitId) {
  if (!limitId) return normalized;
  const buckets = normalized.buckets.filter(b => b.limitId === limitId);
  if (!buckets.length) throw new Error(`Quota bucket '${limitId}' not returned. Available: ${normalized.buckets.map(b => b.limitId).join(', ')}`);
  return { ...normalized, buckets };
}

export async function run(options) {
  const { command, offline, timeoutMs } = options;
  const now = Date.now();
  const result = { version: VERSION, command, capturedAt: new Date(now).toISOString(), offline: !!offline, warnings: [] };
  const emit = () => options.json ? console.log(JSON.stringify(result, null, 2)) : process.stdout.write(render(result, options));
  if (command === 'usage' && !offline) {
    const raw = await withClient(client => client.read('account/usage/read', options.threadId ? { threadId: options.threadId } : {}), { timeoutMs });
    if (options.raw) { console.log(JSON.stringify(raw, null, 2)); return; }
    result.usage = normalizeUsage(raw);
    result.activity = dailyUsage(result.usage, options.days, now);
    if (result.usage?.invalidBuckets) result.warnings.push(`${result.usage.invalidBuckets} invalid daily buckets excluded.`);
    if (options.threadId && !result.usage?.threadUsage) result.warnings.push('No estimated usage returned for this task; availability depends on its billing route.');
    emit(); return result;
  }
  const history = await loadHistory();
  result.warnings.push(...history.warnings);
  if (command === 'history') {
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0); startDay.setDate(startDay.getDate() - options.days + 1);
    result.history = history.snapshots.filter(h => Date.parse(h.capturedAt) >= startDay.getTime() && Date.parse(h.capturedAt) <= now)
      .filter(h => !options.limitId || snapshotNormalized(h).buckets.some(b => b.limitId === options.limitId))
      .map(h => options.limitId ? { ...h, buckets: snapshotNormalized(h).buckets.filter(b => b.limitId === options.limitId) } : h);
    result.historyFile = historyPath(); result.offline = true;
    emit(); return result;
  }
  if (command === 'doctor') {
    const bin = process.env.CODEX_QUOTA_CODEX_BIN || 'codex';
    const check = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: timeoutMs });
    result.checks = [{ name: 'Node.js', detail: process.version }, { name: 'History', detail: `${history.snapshots.length} valid snapshots · ${historyPath()}` }];
    if (check.error || check.status !== 0) throw new Error(`Codex CLI unavailable: ${check.error?.message || check.stderr}`);
    result.checks.push({ name: 'Codex CLI', detail: check.stdout.trim() });
    const live = await fetchLive({ timeoutMs });
    const normalized = normalizeRateLimits(live.rateLimitsRaw);
    result.checks.push({ name: 'Quota RPC', detail: `OK · ${normalized.buckets.length} bucket(s)` },
      { name: 'Activity RPC', detail: live.usageRaw ? `OK · ${live.usageRaw.dailyUsageBuckets?.length ?? 0} reported daily buckets` : 'Optional RPC unavailable' },
      { name: 'Account writes', detail: 'Blocked by transport allowlist' });
    result.warnings.push(...live.warnings);
    emit(); return result;
  }
  let normalized, usage, snapshot;
  if (offline) {
    snapshot = history.snapshots.filter(h => Date.parse(h.capturedAt) <= now).at(-1);
    if (!snapshot) throw new Error('No cached snapshot available. Run cq online first.');
    result.capturedAt = snapshot.capturedAt;
    normalized = snapshotNormalized(snapshot);
    usage = snapshot.usage?.summary ? snapshot.usage : null;
    if (!usage && normalized.accountId) {
      const prior = history.snapshots.filter(h => h.accountId === normalized.accountId && h.usage?.summary && Date.parse(h.capturedAt) <= Date.parse(snapshot.capturedAt)).at(-1);
      if (prior) { usage = prior.usage; result.warnings.push(`Account activity comes from ${prior.capturedAt}.`); }
    }
    result.warnings.push('Cached account and quota state may have changed. Forecast describes the saved snapshot, not current access.');
  } else {
    const live = await fetchLive({ usage: command === 'overview' && !options.raw, timeoutMs });
    if (options.raw) { console.log(JSON.stringify(live.rateLimitsRaw, null, 2)); return; }
    normalized = normalizeRateLimits(live.rateLimitsRaw);
    usage = normalizeUsage(live.usageRaw);
    result.capturedAt = new Date().toISOString();
    snapshot = makeSnapshot(normalized, usage, Date.parse(result.capturedAt));
    result.warnings.push(...live.warnings);
  }
  result.normalized = filterBuckets(normalized, options.limitId);
  result.usage = usage;
  if (usage) result.activity = dailyUsage(usage, options.days, Date.parse(result.capturedAt));
  if (['overview', 'forecast'].includes(command)) result.analysis = analyze(result.normalized, history.snapshots, Date.parse(result.capturedAt), options.reserve);
  if (['overview', 'forecast', 'resets'].includes(command)) {
    const resetAnalysis = result.analysis || analyze(result.normalized, history.snapshots, Date.parse(result.capturedAt), options.reserve);
    result.resetAdvice = adviseResets(result.normalized, resetAnalysis, history.snapshots, Date.now(), { offline: !!offline, capturedAt: Date.parse(result.capturedAt) });
  }
  if (offline && result.analysis) result.analysis.recommendation = { level: 'unknown', title: 'Cached forecast — refresh before acting', detail: 'The projections below were evaluated when this snapshot was captured.' };
  if (result.analysis) result.recommendation = unifiedRecommendation(result.analysis, result.resetAdvice);
  if (result.analysis) result.quickStatus = quickStatus(result.analysis, { offline: !!offline });
  if (!offline && !options.noSave && ['overview', 'status', 'forecast'].includes(command)) {
    try { await saveSnapshot(snapshot); result.saved = true; }
    catch (err) { result.saved = false; result.warnings.push(`Quota loaded, but snapshot could not be saved: ${err.message}`); }
  } else result.saved = false;
  if (!normalized.accountId && result.analysis) result.warnings.push('Account identity was not exposed. Historical comparisons are disabled to avoid mixing accounts.');
  emit(); return result;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      const help = options.vn ? HELP_VI : HELP;
      console.log(options.plain ? ascii(help) : help);
      return;
    }
    if (options.version) { console.log(VERSION); return; }
    await run(options);
  } catch (err) {
    if (args.includes('--json')) console.log(JSON.stringify({ version: VERSION, error: { message: clean(err.message) } }, null, 2));
    else console.error(`codex-quota: ${args.includes('--vn') ? translateError(clean(err.message)) : clean(err.message)}`);
    process.exitCode = process.exitCode || 1;
  }
}
