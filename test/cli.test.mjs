import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../cli.mjs';
import { loadHistory, saveSnapshot } from '../lib/storage.mjs';
import { JsonLineRpc } from '../lib/rpc.mjs';
import { render } from '../lib/render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fake = path.join(root, 'test/fake-codex.mjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'cq-tests-'));
function cli(args, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'codex-quota.mjs'), ...args], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, CODEX_QUOTA_HOME: temp, CODEX_QUOTA_CODEX_BIN: fake, ...env },
  });
}
test('arguments reject unknown options, dangerous commands, and incompatible flags', () => {
  for (const args of [['reset'], ['--typo'], ['usage', '--days', 'NaN'], ['--days', '7'], ['--json', '--raw'], ['history', '--compact'], ['--reserve', '-1'], ['--thread', 'id'], ['usage', '--thread', 'id', '--offline']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['forecast', '--reserve', '15']).reserve, 15);
  assert.equal(parseArgs(['usage', '--days', '30']).days, 30);
});
test('RPC allowlist blocks account writes and all inference before transport', async () => {
  const client = new JsonLineRpc('not-started');
  for (const method of ['turn/start', 'thread/start', 'account/rateLimitResetCredit/consume', 'account/logout', 'account/login/start', 'account/sendAddCreditsNudgeEmail']) await assert.rejects(client.request(method, {}), /Read-only policy/);
  await assert.rejects(client.request('account/read', {}), /refreshToken/);
});
test('help/version and invalid JSON arguments need no Codex access', () => {
  assert.equal(cli(['--version'], { CODEX_QUOTA_CODEX_BIN: '/missing' }).stdout.trim(), '0.2.0');
  const r = cli(['--bad', '--json']); assert.equal(r.status, 1); assert.ok(JSON.parse(r.stdout).error);
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
