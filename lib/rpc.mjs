import { spawn } from 'node:child_process';

export const VERSION = '0.2.0';
// The transport cannot send model, reset, login, billing, or account mutations.
export const READ_METHODS = new Set(['initialize', 'account/read', 'account/rateLimits/read', 'account/usage/read']);

export class JsonLineRpc {
  constructor(command, args = ['app-server', '--stdio'], timeoutMs = 12000) {
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.stderr = '';
    this.closed = false;
  }

  async start() {
    this.child = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.receive(chunk));
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4096); });
    this.child.stdin.on('error', err => this.fail(err));
    this.child.on('error', err => { this.failure = err; this.fail(err); });
    this.child.on('exit', (code, signal) => {
      this.failure = new Error(`Codex app-server exited (${code ?? signal}). ${this.stderr.trim()}`);
      this.fail(this.failure);
    });
    await this.request('initialize', {
      clientInfo: { name: 'codex-quota', title: 'Codex Quota Coach', version: VERSION },
      capabilities: { experimentalApi: true },
    });
    this.child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    return this;
  }

  receive(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 16 * 1024 * 1024) {
      this.fail(new Error('Oversized app-server response.'));
      this.close();
      return;
    }
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      // Ignore notifications and server requests; never execute them.
      if (message.method || message.id == null) continue;
      const pending = this.pending.get(String(message.id));
      if (!pending) continue;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      if (message.error) {
        const err = new Error(message.error.message || 'JSON-RPC error');
        err.code = message.error.code;
        pending.reject(err);
      } else pending.resolve(message.result);
    }
  }

  request(method, params, omitParams = false) {
    if (!READ_METHODS.has(method)) return Promise.reject(new Error(`Read-only policy: blocked ${method}`));
    if (method === 'account/read' && params?.refreshToken !== false) {
      return Promise.reject(new Error('Read-only policy: account/read requires refreshToken: false'));
    }
    if (this.closed || this.failure) return Promise.reject(this.failure || new Error('Connection closed.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Timed out waiting for ${method}`));
      }, this.timeoutMs);
      this.pending.set(String(id), { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, ...(!omitParams ? { params: params ?? {} } : {}) }) + '\n', err => {
        if (err) { clearTimeout(timer); this.pending.delete(String(id)); reject(err); }
      });
    });
  }

  async read(method, params = {}) {
    try { return await this.request(method, params); } catch (err) {
      // Never drop a thread filter or account/read's refreshToken guard.
      if (Object.keys(params).length === 0 && [-32600, -32602].includes(err.code)) {
        return this.request(method, undefined, true);
      }
      throw err;
    }
  }

  fail(err) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new Error('Connection closed.'));
    const child = this.child;
    if (!child) return;
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    // killed only means a signal was sent, not that the process exited.
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 800);
    timer.unref();
    child.once('exit', () => clearTimeout(timer));
  }
}

export async function withClient(fn, { bin = process.env.CODEX_QUOTA_CODEX_BIN || 'codex', timeoutMs = 12000 } = {}) {
  const client = new JsonLineRpc(bin, ['app-server', '--stdio'], timeoutMs);
  const stop = () => { client.close(); process.exitCode = 130; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try { await client.start(); return await fn(client); }
  finally { client.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}

export async function fetchLive({ usage = true, threadId, ...options } = {}) {
  return withClient(async client => {
    // A mandatory quota read must succeed; optional telemetry never hides it.
    const rateLimitsRaw = await client.read('account/rateLimits/read');
    let usageRaw = null;
    const warnings = [];
    if (usage) {
      try { usageRaw = await client.read('account/usage/read', threadId ? { threadId } : {}); }
      catch (err) { warnings.push(`Account activity unavailable: ${err.message}`); }
    }
    return { rateLimitsRaw, usageRaw, warnings };
  }, options);
}
