import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../lib/rpc.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('install and upgrade stage complete modules, keep old releases and leave shell/history alone', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cq-install-'));
  const prefix = path.join(tmp, "prefix with 'quotes'");
  const history = path.join(tmp, 'history'); await mkdir(history);
  const historyFile = path.join(history, 'history.jsonl'); await writeFile(historyFile, 'original history\n');
  const env = { ...process.env, CODEX_QUOTA_PREFIX: prefix, CODEX_QUOTA_HOME: history };
  for (let i = 0; i < 2; i++) {
    const installed = spawnSync(process.execPath, [path.join(root, 'install.mjs')], { encoding: 'utf8', env });
    assert.equal(installed.status, 0, installed.stderr);
    const cq = spawnSync(path.join(prefix, 'bin', 'cq'), ['--version'], { encoding: 'utf8', env });
    assert.equal(cq.status, 0, cq.stderr); assert.equal(cq.stdout.trim(), VERSION);
  }
  assert.equal((await readdir(path.join(prefix, 'share/codex-quota-coach/releases'))).length, 2);
  assert.equal((await readdir(path.join(prefix, 'share/codex-quota-coach'))).filter(x => x.startsWith('launcher-before-')).length, 1);
  assert.equal(await readFile(historyFile, 'utf8'), 'original history\n');
});
test('installer refuses an unrelated executable rather than replacing it', async () => {
  const prefix = await mkdtemp(path.join(os.tmpdir(), 'cq-install-conflict-'));
  await mkdir(path.join(prefix, 'bin'));
  const file = path.join(prefix, 'bin/codex-quota'); await writeFile(file, 'unrelated');
  const r = spawnSync(process.execPath, [path.join(root, 'install.mjs')], { encoding: 'utf8', env: { ...process.env, CODEX_QUOTA_PREFIX: prefix } });
  assert.equal(r.status, 1); assert.equal(await readFile(file, 'utf8'), 'unrelated');
});
