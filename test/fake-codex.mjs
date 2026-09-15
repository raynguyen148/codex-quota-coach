#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
if (process.argv.includes('--version')) { console.log('codex-test 0.154.0'); process.exit(0); }
const mode = process.env.CQ_TEST_SCENARIO;
const quota = { accountId: 'synthetic-account', ordinaryUsageAllowed: true,
  rateLimits: { limitId: 'codex', planType: 'pro', primary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000 + 3 * 86400) } },
  rateLimitResetCredits: { availableCount: 2, credits: null } };
const usage = { summary: { lifetimeTokens: 123456, currentStreakDays: 2 }, dailyUsageBuckets: [{ startDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), tokens: 1000 }] };
if (mode === 'reset-soon') {
  quota.rateLimits.primary.usedPercent = 95;
  quota.rateLimitResetCredits = { availableCount: 1, credits: [{ id: 'synthetic-reset', status: 'available', resetType: 'codexRateLimits', expiresAt: Math.floor(Date.now() / 1000 + 7200) }] };
}
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (process.env.CQ_TEST_RPC_LOG) appendFileSync(process.env.CQ_TEST_RPC_LOG, request.method + '\n');
  if (!request.id) continue;
  if (mode === 'timeout') continue;
  if (mode === 'exit') process.exit(2);
  let result = {}, error;
  if (request.method === 'account/rateLimits/read') {
    if (mode === 'quota-fail') error = { code: -32000, message: 'Synthetic quota unavailable' };
    else result = quota;
  } else if (request.method === 'account/usage/read') {
    if (mode === 'usage-fail') error = { code: -32601, message: 'Method not found' };
    else if (mode === 'omit' && request.params) error = { code: -32602, message: 'No params supported' };
    else if (request.params?.threadId) result = { ...usage, threadUsage: { threadId: request.params.threadId, groups: [{ model: 'synthetic-model', totalTokens: 123, inputTokens: 100, outputTokens: 23 }] } };
    else result = usage;
  } else if (request.method !== 'initialize') {
    error = { code: -32601, message: 'Unapproved method in test' };
  }
  // A notification must not be mistaken for the response.
  process.stdout.write(JSON.stringify({ method: 'synthetic/notification', params: {} }) + '\n');
  process.stdout.write(JSON.stringify({ id: request.id, ...(error ? { error } : { result }) }) + '\n');
}
