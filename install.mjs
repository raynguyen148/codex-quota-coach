import { mkdir, copyFile, readFile, writeFile, rename, lstat, symlink, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { VERSION } from './lib/rpc.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const prefix = path.resolve(process.env.CODEX_QUOTA_PREFIX || path.join(os.homedir(), '.local'));
const bin = path.join(prefix, 'bin');
const app = path.join(prefix, 'share', 'codex-quota-coach');
const wrapper = path.join(bin, 'codex-quota');
const alias = path.join(bin, 'cq');
const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const release = path.join(app, 'releases', `${VERSION}-${stamp}`);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
async function optionalStat(file) {
  try { return await lstat(file); } catch (err) { if (err.code !== 'ENOENT') throw err; return null; }
}

try {
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18 or newer is required.');
  const old = await optionalStat(wrapper);
  if (old && (!old.isFile() || !(await readFile(wrapper, 'utf8')).includes('codex-quota-coach'))) throw new Error(`Unrecognized executable at ${wrapper}; refusing to replace it.`);
  const oldAlias = await optionalStat(alias);
  if (oldAlias && (!oldAlias.isSymbolicLink() || path.resolve(bin, await readlink(alias)) !== wrapper)) throw new Error(`Unrecognized command at ${alias}; refusing to replace it.`);
  await mkdir(path.join(release, 'lib'), { recursive: true });
  const files = ['codex-quota.mjs', 'cli.mjs', 'lib/rpc.mjs', 'lib/analysis.mjs', 'lib/resets.mjs', 'lib/storage.mjs', 'lib/render.mjs', 'README.md', 'REVIEW.md'];
  for (const file of files) await copyFile(path.join(source, file), path.join(release, file));
  const verify = spawnSync(process.execPath, [path.join(release, 'codex-quota.mjs'), '--version'], { encoding: 'utf8', timeout: 5000 });
  if (verify.status !== 0 || verify.stdout.trim() !== VERSION) throw new Error('Staged installation failed verification; active command was not changed.');
  await mkdir(bin, { recursive: true });
  let backup;
  if (old) {
    backup = path.join(app, `launcher-before-${stamp}`);
    await copyFile(wrapper, backup);
  }
  const stagedWrapper = path.join(bin, `.codex-quota-${stamp}`);
  await writeFile(stagedWrapper, `#!/bin/sh\nexec node ${quote(path.join(release, 'codex-quota.mjs'))} "$@"\n`, { mode: 0o755, flag: 'wx' });
  await rename(stagedWrapper, wrapper);
  if (!oldAlias) await symlink(wrapper, alias);
  console.log(`Installed Codex Quota Coach v${VERSION}\nCommands: cq, codex-quota\nRelease: ${release}\nHistory was not modified.`);
  if (backup) console.log(`Previous launcher: ${backup}\nRollback: cp ${quote(backup)} ${quote(wrapper)}`);
  if (!(process.env.PATH || '').split(path.delimiter).includes(bin)) console.log(`Add ${bin} to PATH. Shell startup files were not changed.`);
} catch (err) { console.error(`Install failed: ${err.message}`); process.exitCode = 1; }
