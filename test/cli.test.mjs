import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { HELP, HELP_VI, parseArgs } from '../cli.mjs';
import { loadHistory, saveSnapshot } from '../lib/storage.mjs';
import { JsonLineRpc, VERSION } from '../lib/rpc.mjs';
import { render, date } from '../lib/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fake = path.join(root, 'test/fake-codex.mjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'cq-tests-'));
test('midnight timestamps use 00 rather than ambiguous 24-hour dates', () => {
  const midnight = new Date(2027, 0, 2, 0, 43);
  assert.match(date(midnight.getTime() / 1000), /00:43/);
});
function cli(args, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'codex-quota.mjs'), ...args], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, CODEX_QUOTA_HOME: temp, CODEX_QUOTA_CODEX_BIN: fake, ...env },
  });
}
test('arguments reject unknown options, dangerous commands, and incompatible flags', () => {
  for (const args of [['reset'], ['--typo'], ['usage', '--days', 'NaN'], ['--days', '7'], ['--json', '--raw'], ['history', '--compact'], ['--reserve', '-1'], ['--thread', 'id'], ['usage', '--thread', 'id', '--offline']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['forecast', '--reserve', '15']).reserve, 15);
  assert.equal(parseArgs(['usage', '--days', '30']).days, 30);
  assert.equal(parseArgs(['status', '--vn']).vn, true);
});
test('RPC allowlist blocks account writes and all inference before transport', async () => {
  const client = new JsonLineRpc('not-started');
  for (const method of ['turn/start', 'thread/start', 'account/rateLimitResetCredit/consume', 'account/logout', 'account/login/start', 'account/sendAddCreditsNudgeEmail']) await assert.rejects(client.request(method, {}), /Read-only policy/);
  await assert.rejects(client.request('account/read', {}), /refreshToken/);
});
test('help/version and invalid JSON arguments need no Codex access', () => {
  assert.equal(cli(['--version'], { CODEX_QUOTA_CODEX_BIN: '/missing' }).stdout.trim(), VERSION);
  const r = cli(['--bad', '--json']); assert.equal(r.status, 1); assert.ok(JSON.parse(r.stdout).error);
  assert.match(HELP, /--vn\s+Vietnamese human-readable output/);
  assert.match(HELP_VI, /--vn\s+Đầu ra tiếng Việt dành cho người đọc/);
  assert.match(cli(['--help'], { CODEX_QUOTA_CODEX_BIN: '/missing' }).stdout, /Friendly status/);
  assert.match(cli(['--vn', '--help'], { CODEX_QUOTA_CODEX_BIN: '/missing' }).stdout, /Trạng thái thân thiện/);
  assert.doesNotMatch(cli(['--vn', '--help', '--plain'], { CODEX_QUOTA_CODEX_BIN: '/missing' }).stdout, /[^\x00-\x7f]/);
});

test('vn localizes human output while keeping commands and machine output stable', () => {
  const english = cli(['status', '--plain', '--no-save']);
  const vietnamese = cli(['status', '--vn', '--no-save']);
  const vietnamesePlain = cli(['status', '--vn', '--plain', '--no-save']);
  assert.equal(english.status, 0, english.stderr);
  assert.equal(vietnamese.status, 0, vietnamese.stderr);
  assert.equal(vietnamesePlain.status, 0, vietnamesePlain.stderr);
  assert.match(english.stdout, /QUOTA/);
  assert.match(vietnamese.stdout, /HẠN MỨC/);
  assert.doesNotMatch(vietnamese.stdout, /No quota windows|left|More data needed|available/);
  assert.match(vietnamese.stdout, /còn|Đặt lại/);
  assert.doesNotMatch(vietnamesePlain.stdout, /[^\x00-\x7f]/);

  const jsonEnglish = JSON.parse(cli(['--json', '--no-save']).stdout);
  const jsonVietnamese = JSON.parse(cli(['--json', '--vn', '--no-save']).stdout);
  assert.equal(jsonVietnamese.command, jsonEnglish.command);
  assert.equal(jsonVietnamese.normalized.buckets[0].windows[0].label, jsonEnglish.normalized.buckets[0].windows[0].label);
  assert.equal(jsonVietnamese.analysis.recommendation.title, jsonEnglish.analysis.recommendation.title);
});

test('vn covers every human-readable command and reset advice', () => {
  for (const args of [[], ['forecast'], ['usage'], ['resets'], ['doctor']]) {
    const env = args[0] === 'resets' ? { CQ_TEST_SCENARIO: 'reset-soon' } : {};
    const r = cli([...args, '--vn', '--plain', '--no-save'], env);
    assert.equal(r.status, 0, `${args[0] || 'overview'}: ${r.stderr}`);
    assert.doesNotMatch(r.stdout, /More data needed|Without reset|RESET COACH|ACCOUNT ACTIVITY|DIAGNOSTICS|next expires in|valid snapshots|bucket\(s\)/);
  }
  const reset = cli(['--vn', '--compact', '--no-save'], { CQ_TEST_SCENARIO: 'reset-soon' });
  assert.match(reset.stdout, /Khuyến nghị/);
  assert.doesNotMatch(reset.stdout, /available|next expires in|Advice:|Check a manual reset|Without a manual reset/);
});

test('vn translates human errors but --json stays structured', () => {
  const vn = cli(['--vn', '--bad']);
  assert.equal(vn.status, 1);
  assert.match(vn.stderr, /Tùy chọn không được nhận diện/);
  const en = cli(['--bad']);
  assert.equal(en.status, 1);
  assert.match(en.stderr, /Unknown option/);
  const json = cli(['--vn', '--bad', '--json']);
  assert.equal(json.status, 1);
  assert.match(JSON.parse(json.stdout).error.message, /Unknown option/);
});
test('status skips optional usage RPC and --no-save preserves history', async () => {
  const r = cli(['status', '--json', '--no-save'], { CQ_TEST_SCENARIO: 'usage-fail' });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.saved, false);
  assert.equal((await loadHistory(path.join(temp, 'history.jsonl'))).snapshots.length, 0);
});
test('optional usage failure does not hide quota or break JSON', () => {
  const r = cli(['--json', '--no-save'], { CQ_TEST_SCENARIO: 'usage-fail' });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.normalized.buckets[0].windows[0].remainingPercent, 70);
  assert.equal(result.warnings.length, 1);
});
test('mandatory quota failures return structured errors and nonzero status', () => {
  const r = cli(['status', '--json'], { CQ_TEST_SCENARIO: 'quota-fail' });
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).error.message, /quota unavailable/);
});
test('usage is independent of quota RPC; thread filters never disappear on compatibility retry', () => {
  assert.equal(cli(['usage', '--json'], { CQ_TEST_SCENARIO: 'quota-fail' }).status, 0);
  assert.equal(cli(['usage', '--json'], { CQ_TEST_SCENARIO: 'omit' }).status, 0);
  const r = cli(['usage', '--thread', 'synthetic-task', '--json'], { CQ_TEST_SCENARIO: 'omit' });
  assert.equal(r.status, 1); assert.ok(JSON.parse(r.stdout).error);
  const ok = cli(['usage', '--thread', 'synthetic-task', '--json']);
  assert.equal(JSON.parse(ok.stdout).usage.threadUsage.threadId, 'synthetic-task');
});
test('raw usage and raw quota keep their response shapes and do not save', () => {
  assert.ok(JSON.parse(cli(['usage', '--raw']).stdout).dailyUsageBuckets);
  assert.ok(JSON.parse(cli(['--raw']).stdout).rateLimits);
});
test('RPC timeout and early exit return promptly without hanging children', () => {
  for (const scenario of ['timeout', 'exit']) {
    const r = cli(['status', '--json', '--timeout', '1'], { CQ_TEST_SCENARIO: scenario });
    assert.equal(r.status, 1); assert.ok(JSON.parse(r.stdout).error);
  }
});
test('history and offline snapshots work without a Codex executable', async () => {
  const live = cli(['--json']); assert.equal(live.status, 0, live.stderr);
  const contents = await readFile(path.join(temp, 'history.jsonl'), 'utf8');
  const h = cli(['history', '--json'], { CODEX_QUOTA_CODEX_BIN: '/missing' });
  assert.equal(JSON.parse(h.stdout).history.length, 1);
  const offline = cli(['--offline', '--json'], { CODEX_QUOTA_CODEX_BIN: '/missing' });
  assert.equal(offline.status, 0);
  assert.equal(JSON.parse(offline.stdout).analysis.recommendation.level, 'unknown');
  assert.equal(await readFile(path.join(temp, 'history.jsonl'), 'utf8'), contents);
});
test('history appends preserve existing bytes and recover after malformed last row', async () => {
  const file = path.join(temp, 'malformed.jsonl');
  const old = '{"partial":'; await writeFile(file, old);
  const snapshot = { capturedAt: new Date().toISOString(), windows: [] };
  await saveSnapshot(snapshot, file);
  assert.ok((await readFile(file, 'utf8')).startsWith(old + '\n'));
  const h = await loadHistory(file); assert.equal(h.snapshots.length, 1); assert.equal(h.malformed, 1);
});
test('no history is distinct from inaccessible history', async () => {
  assert.equal((await loadHistory(path.join(temp, 'missing'))).warnings.length, 0);
  assert.ok((await loadHistory(temp)).warnings.length > 0);
});
test('plain output is ASCII, compact output is one line, terminal controls are sanitized', () => {
  const result = JSON.parse(cli(['--json', '--no-save']).stdout);
  result.normalized.buckets[0].limitName = 'name\x1b[2J\nspoof';
  const text = render(result, { plain: true });
  assert.doesNotMatch(text, /[^\x00-\x7f]/);
  assert.doesNotMatch(text, /\x1b/);
  assert.equal(render(result, { compact: true }).trim().split('\n').length, 1);
});
test('all informational commands produce parseable JSON', () => {
  for (const command of ['forecast', 'usage', 'resets', 'doctor', 'history']) {
    const r = cli([command, '--json', '--no-save']); assert.equal(r.status, 0, `${command}: ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).command, command);
  }
});

test('reset advice sends only initialization and a quota read, preserving history', async () => {
  const log = path.join(temp, 'reset-rpcs.log');
  const file = path.join(temp, 'history.jsonl');
  const before = await readFile(file, 'utf8');
  const r = cli(['resets', '--json'], { CQ_TEST_SCENARIO: 'reset-soon', CQ_TEST_RPC_LOG: log });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).resetAdvice.status, 'consider_manual');
  assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), ['initialize', 'initialized', 'account/rateLimits/read']);
  assert.equal(await readFile(file, 'utf8'), before);
});
test('overview/forecast/compact present reset advice and offline suppresses it', () => {
  for (const command of [[], ['forecast']]) {
    const r = cli([...command, '--json', '--no-save'], { CQ_TEST_SCENARIO: 'reset-soon' });
    assert.equal(JSON.parse(r.stdout).resetAdvice.status, 'consider_manual');
    const data = JSON.parse(r.stdout);
    assert.equal(data.recommendation.conditionalOnManualReset, true);
    assert.notEqual(data.analysis.recommendation.title, data.recommendation.title);
  }
  const line = cli(['--compact', '--no-save'], { CQ_TEST_SCENARIO: 'reset-soon' }).stdout;
  assert.equal(line.trim().split('\n').length, 1);
  assert.match(line, /Advice: check a manual reset now if needed/);
  assert.equal((line.match(/Advice:/g) || []).length, 1);
  const forecast = cli(['forecast', '--no-save', '--plain'], { CQ_TEST_SCENARIO: 'reset-soon' }).stdout;
  assert.match(forecast, /Without reset/);
  assert.match(forecast, /no manual reset/);
  assert.match(forecast, /RESET TIMELINE/);
  assert.match(forecast, /DO NOW/);
  const overview = JSON.parse(cli(['--json', '--no-save'], { CQ_TEST_SCENARIO: 'reset-soon' }).stdout);
  assert.ok(overview.quickStatus);
  assert.equal(overview.quickStatus.basis, 'without manual reset');
  assert.notEqual(overview.quickStatus.risk, 'ok');
  const r = cli(['resets', '--offline', '--json'], { CODEX_QUOTA_CODEX_BIN: '/missing' });
  assert.equal(JSON.parse(r.stdout).resetAdvice.status, 'refresh_required');
});

test('friendly overview leads with status, target and advice at narrow widths', () => {
  const result = { command: 'overview', capturedAt: new Date().toISOString(), normalized: { buckets: [] },
    quickStatus: { risk: 'high', label: 'HIGH RISK', message: 'Current pace may exhaust quota before the natural reset.',
      limitId: 'codex', window: 'Weekly', durationMins: 10080, perDay: 20, safePerDay: 10, aboveBudgetPercent: 100, confidence: 'medium', source: 'recency-weighted quota history' },
    recommendation: { detail: 'Reduce pace for now.' } };
  const script = `import {render} from './lib/render.mjs';Object.defineProperty(process.stdout,'isTTY',{value:true});Object.defineProperty(process.stdout,'columns',{value:48});console.log(render(${JSON.stringify(result)}, {plain:process.env.CQ_PLAIN === '1'}));`;
  const env = { ...process.env, TERM: 'xterm-256color' }; delete env.NO_COLOR;
  const run = extra => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' }).stdout;
  const colored = run({});
  assert.match(colored, /\x1b\[1;30;43m HIGH RISK /);
  assert.match(colored, /\x1b\[1;33m20 points\/day/);
  assert.match(colored, /\x1b\[1;36m10 points\/day/);
  for (const output of [run({ NO_COLOR: '1' }), run({ CQ_PLAIN: '1' })]) {
    assert.doesNotMatch(output, /\x1b/);
    assert.match(output, /HIGH RISK/); assert.match(output, /Current\s+20 points\/day/);
    assert.match(output, /Safe target\s+10 points\/day/); assert.match(output, /100% over target/);
    assert.match(output, /ADVICE/); assert.doesNotMatch(output, /DO NOW|Risk basis|Evidence/);
    assert.ok(output.indexOf('HIGH RISK') < output.indexOf('\nQUOTA\n'));
    assert.ok(output.indexOf('\nQUOTA\n') < output.indexOf('\nPACE\n'));
    assert.ok(output.indexOf('PACE') < output.indexOf('ADVICE'));
    assert.ok(output.trimEnd().split('\n').every(line => line.length <= 48));
  }
});

test('human summaries hide secondary model buckets unless explicitly selected', () => {
  const result = JSON.parse(cli(['--json', '--no-save']).stdout);
  const spark = { limitId: 'spark', limitName: 'GPT-5.3-Codex-Spark', planType: 'prolite', windows: [
    { limitId: 'spark', slot: 'primary', label: '5-hour', durationMins: 300, remainingPercent: 100, resetsAt: Math.floor(Date.now() / 1000 + 3600) },
  ] };
  result.normalized.buckets.push(spark);
  const overview = render(result, { plain: true });
  assert.match(overview, /QUOTA[\s\S]*PACE[\s\S]*ADVICE/);
  assert.doesNotMatch(overview, /GPT-5\.3-Codex-Spark|Latest activity|Workspace credit|Included usage|RESET COACH|pp =/);
  assert.ok(overview.trimEnd().split('\n').length <= 22);
  const status = render({ ...result, command: 'status' }, { plain: true });
  assert.doesNotMatch(status, /GPT-5\.3-Codex-Spark/);
  assert.doesNotMatch(render(result, { compact: true }), /spark/);
  const selected = render({ ...result, command: 'status', normalized: { ...result.normalized, buckets: [spark] } }, { plain: true, limitId: 'spark' });
  assert.match(selected, /GPT-5\.3-Codex-Spark/);
});
