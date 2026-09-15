import { createReadStream } from 'node:fs';
import { mkdir, appendFile, open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';

export function dataDir() {
  return process.env.CODEX_QUOTA_HOME || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Codex Quota Coach')
    : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'codex-quota-coach'));
}
export const historyPath = () => path.join(dataDir(), 'history.jsonl');

export async function loadHistory(file = historyPath()) {
  const snapshots = [], warnings = [];
  let malformed = 0;
  const input = createReadStream(file, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      try {
        const h = JSON.parse(line);
        if (!h || !Number.isFinite(Date.parse(h.capturedAt)) ||
          !(Array.isArray(h.windows) || Array.isArray(h.buckets))) throw new Error('invalid snapshot');
        if (h.windows && (!Array.isArray(h.windows) || h.windows.some(w => !w || typeof w !== 'object'))) throw new Error('invalid windows');
        if (h.buckets && (!Array.isArray(h.buckets) || h.buckets.some(b => !b || !Array.isArray(b.windows) || b.windows.some(w => !w || typeof w !== 'object')))) throw new Error('invalid buckets');
        snapshots.push(h);
      } catch { malformed++; }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') warnings.push(`Cannot read local history: ${err.message}`);
  } finally { reader.close(); input.destroy(); }
  if (malformed) warnings.push(`Skipped ${malformed} malformed history row(s); original data was preserved.`);
  snapshots.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  return { snapshots, warnings, malformed };
}

export async function saveSnapshot(snapshot, file = historyPath()) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Preserve an old/truncated last row rather than joining the new JSON onto it.
  let prefix = '';
  let handle;
  try {
    handle = await open(file, 'r');
    const { size } = await handle.stat();
    if (size) {
      const byte = Buffer.alloc(1);
      await handle.read(byte, 0, 1, size - 1);
      if (byte[0] !== 10) prefix = '\n';
    }
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  finally { await handle?.close(); }
  await appendFile(file, prefix + JSON.stringify(snapshot) + '\n', { encoding: 'utf8', mode: 0o600 });
}
