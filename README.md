# Codex Quota Coach

A local, dependency-free Node.js CLI for personal Codex quota planning. Version **0.4.2**; Node.js 18+; tested against Codex CLI **0.154.0**.

The default `cq` view is a short, scan-first dashboard: highlighted status, core quota and reset time, current pace versus a safe target, then direct advice. Secondary model buckets, token activity, workspace-credit details and long methodology notes stay out of the default view. Use the focused commands for details; `--json` and `--raw` still preserve every returned bucket. Status labels remain visible without color (`--plain`, `NO_COLOR`, pipes).

`ON TRACK` preserves the planned buffer; `LOW RISK` flags possible buffer erosion; `HIGH RISK` projects exhaustion before natural reset; `DANGER` means exhausted quota or a reported access restriction. Sparse evidence and offline snapshots show `UNKNOWN`, not a green forecast. These are planning categories, not probabilities. An unused reset credit never lowers the current risk label.

## Daily use

| Command | Purpose |
| --- | --- |
| `cq` | Friendly overview: status, core quota, safe pace and direct advice |
| `cq status --compact` | One-line current quota; skips account activity |
| `cq forecast --limit codex` | Recent pace, trend coverage, forecast and sensitivity range |
| `cq usage --days 7` | Reported daily token totals and a terminal bar chart |
| `cq usage --days 30 --json` | Export token activity and summary metrics |
| `cq usage --thread TASK_ID` | Optional task/model token breakdown, when the backend exposes it |
| `cq resets` | Read-only reset advice, observed quota today, expiry dates and excess-credit scenarios |
| `cq history --days 7` | Local quota snapshots; does not contact Codex |
| `cq --offline` | View the last saved snapshot with an explicit stale-data notice |
| `cq doctor` | Check the CLI, quota/activity RPCs and history readability |

`codex-quota` is the full command name; `cq` is the alias. Use `cq --help` for all options.

- `--reserve 10`: retain a 10-percentage-point buffer at reset (default). Use 0–50 with overview/forecast. This is a planning preference, not an account setting.
- `--limit ID`: explicitly inspect one returned bucket. Human-readable summaries otherwise focus on the core `codex` quota. Names without a model mapping remain opaque; the tool does not guess which model they represent.
- `--json`: structured output for every command, including errors. v0.2 adds `normalized.buckets` and `analysis`; consumers of the v0.1 report JSON must update their field paths. Historical JSONL rows remain compatible.
- `--raw`: unmodified quota response; `cq usage --raw` gives account activity. No snapshot is saved. Raw responses may contain account/credit identifiers; inspect before sharing.
- `--no-save`: read live without appending quota history.
- `--plain` / `NO_COLOR=1`: plain ASCII / no terminal color. Piped output has no ANSI color.
- `--timeout 12`: per-request timeout in seconds, 1–60.

## What data is available?

Quota is authoritative from `account/rateLimits/read`: all returned limit buckets, window duration/usage/reset, ordinary-usage permission, plan, workspace credit and spend-control state, plus banked reset inventory when exposed.

`account/usage/read` supplies daily token buckets, lifetime tokens, peak daily tokens, current/longest streak, and longest-running turn. Optional `threadId` requests can expose task estimates grouped by model, reasoning effort and speed, including input/cached/new-input/output tokens. Actual availability depends on the backend and task billing route. Raw backend credit/USD estimates are kept in JSON; the CLI does not interpret these as an invoice or charge.

These are **network-backed account reads using the existing Codex login**, not paid model API calls. No OpenAI API key or model inference is used. There is no always-running service. `history` and `--offline` work without network or a Codex process.

Daily dates are backend labels; the protocol does not establish their timezone, freshness SLA, completeness or an exact conversion to quota percentages. Date filtering uses UTC calendar labels, including the current date. A missing day is unknown, not zero, and today's bucket may not exist yet. Reported totals only add the returned days. Token activity is never multiplied by an API price or used to fabricate quota burn.

## How the coach works

1. Match history by account ID, bucket, plan, duration and exact reset timestamp. Missing identity disables historical comparisons. Read v0.1 JSONL without migration.
2. Measure percentage-point changes between snapshots. Reset changes, missing windows, plan changes and counter decreases break continuity; rapid checks are coalesced to at least one hour.
3. Weight interval rates by observed duration and recency, using a 24-hour half-life. The forecast uses observations after the latest cycle/counter discontinuity and requires at least six observed hours; otherwise it falls back to the current-window average with low confidence.
4. Report 24h/3-day/7-day averages only when whole observed intervals cover at least 75% of that period. Never interpolate an unknown multi-day interval into daily measurements. Coverage and low/medium/high heuristic confidence remain visible.
5. Suggested budget = max(remaining percentage points − buffer, 0) / days until reset. The no-buffer cap is also visible in `forecast`. Short windows show points/hour.
6. Project only to the next natural reset. An exhaustion date is shown only when the estimated pace runs out before that reset. The pace range uses observed variability and 1-point measurement resolution; it is a sensitivity range, **not a statistical confidence interval**.
7. Within the main `codex` bucket, the most restrictive window governs the overall advice. Secondary buckets stay hidden in human summaries unless selected with `--limit`; JSON/raw output retains them. Service-reported access/spend restrictions take priority over percentages. Without a main bucket, the most restrictive returned window is used.
8. Recommend additional work only with sufficient recent evidence, confirmed ordinary-usage permission and headroom even at the higher estimated pace. Sparse/fallback data produces provisional advice. Reset credits never increase the assumed budget.
9. Structured analysis can identify another backend-named model bucket with at least 25% remaining in each returned window. It is not promoted in the normal terminal view; quota does not establish equivalent model capability.

Historical rates are observations, not promises. Future model choices, reasoning depth, speed modes and long tasks may change consumption. Current-window fallback also assumes the full reported duration preceded the reset; it cannot establish recent pace. Check near the start/end of work sessions and after unusually heavy work. More frequent identical checks do not manufacture confidence.

## Reset coach (v0.3)

`cq` and `cq forecast` now include reset advice. `cq resets` provides the full evidence and per-credit assessment; `cq resets --json` exposes `resetAdvice`. This is on-demand CLI output, not a scheduled notification. Every account operation remains read-only; there is no reset command or consume RPC.

The advisor compares the recent weighted **quota** pace, quota changes actually observed today, each known compatible credit's expiry, and the next natural reset. It uses core `codex` windows identified as 300 or 10080 minutes. It does not assume earned credits apply to other model buckets. The ordinary quota budget still assumes no manual resets.

### Decisions

- **Consider a manual reset:** core quota is at or below the advisory 10% threshold, a compatible credit expires within 72 hours, and waiting for a nearby natural reset would not clearly be preferable. Advice is conditional on having useful work to continue. Eligibility must be checked manually in Codex; a read response does not confirm it.
- **Watch before expiry:** average pace could reach 10% before both the credit deadline and natural reset. A higher pace or today's acceleration can also produce a watch, explicitly labeled as a sensitivity scenario. It never tells you to reset healthy quota now.
- **Prefer/reassess after natural reset:** if low windows refresh within six hours and the credit survives that refresh, waiting is preferred. If quota only reaches the threshold after the next natural reset, that crossing is not treated as a valid prediction for this cycle.
- **Expiry risk:** current demand may not create a useful reset opportunity before expiry. Several expiring credits are compared with shared projected demand rather than assigning the same first opportunity independently to every credit. Do useful work when needed; do not manufacture work or reset healthy quota merely to spend credits.
- **Unknown/refresh:** unavailable identity, count, expiry, unsupported reset type, inconsistent inventory, stale/offline state or insufficient history cannot justify an actionable expiry recommendation. Workspace/spend restrictions are not presented as problems a reset will solve.

### Today's evidence and uncertainty

Today's quota usage is the sum of monotonic, same-cycle deltas between account/plan-matched snapshots **within the current local calendar day**. Pre-midnight intervals are not divided into invented daily values. The report shows observed hours and coverage; the result is always a partial observation, not an assertion of a complete daily total. A missing comparison is unknown, while a measured zero remains zero. Reset/correction gaps are excluded.

At least three observed hours without a discontinuity or saturation are needed to calculate a within-day pace. Faster usage today influences only the higher scenario until local midnight; historical pace resumes afterward. A quiet morning does not erase the longer-term estimate. Local date boundaries respect timezone/DST. Account token buckets are not converted into quota usage or used to trigger reset advice.

### Multiple credits and expiry safeguards

Credit IDs deduplicate detail rows; conflicting rows/counts suppress advice. Available count stays authoritative. Expired/revoked rows cannot be recommended; missing detail rows retain unknown expiry. Missing IDs disable aggregate counting rather than guessing whether identical-looking rows are distinct credits.

The forecast horizon is seven days, with a 15-minute margin before expiry and a 15-minute maximum snapshot age for live advice. The 10% low-quota threshold is a **planning policy, not a fetched backend eligibility flag**. Suggested re-check times are informational; nothing runs in the background.

Identified compatible credits are simulated **sequentially in expiry order**, at average, slower, faster and today-adjusted pace. Each hypothetical manual reset refills all modeled core windows to 100% at the advisory 10% threshold. A skipped/expired credit never refills quota; simultaneous low windows never consume multiple credits. Each later check explicitly depends on earlier hypothetical resets actually happening. Unknown expiry and hidden credits are not assigned dates. Low-confidence scenarios are illustrations, not actionable timing predictions.

`cq resets` and `cq forecast` show this conditional timeline. Planning stops at the first reported natural refresh or seven days: future natural cycles and post-manual-reset dates are not known. The scenario assumes the currently reported natural deadline remains unchanged, so **re-run after every manual or natural reset**. Actual eligibility, credit selection and refill effects must be confirmed in Codex. Potential unused-credit counts refer only to known deadlines before that boundary, under the faster scenario; they are not guarantees or an incentive to create unnecessary work.

The overview and compact view use a unified recommendation when a supported reset check offers an alternative to conservation. `Without reset` budgets and forecast assessments remain unchanged fallback calculations. JSON preserves `analysis.recommendation` as the no-reset baseline, exposes the unified `recommendation`, and includes `resetAdvice.timeline` with scenario-specific times and dependencies. This does not promise that resets sustain the current pace indefinitely.

Reset details now retain their opaque IDs for deduplication. IDs are account metadata, not credentials. Existing history rows are read without migration or rewriting.

## Install / update

```sh
./install.sh
cq --version
cq doctor
```

The installer stages a complete versioned release beneath `~/.local/share/codex-quota-coach/releases`, verifies it, then atomically replaces the launcher in `~/.local/bin`. It preserves the previous launcher and prints an exact rollback command. No shell startup file, Codex installation, account setting or quota history is changed. Unrecognized commands at the target path are not overwritten.

Use `CODEX_QUOTA_PREFIX` for another install prefix. Add its `bin` directory to PATH if necessary. Old releases are retained for rollback.

## Storage and privacy

Default macOS history:

```text
~/Library/Application Support/Codex Quota Coach/history.jsonl
```

Linux: `$XDG_DATA_HOME/codex-quota-coach/history.jsonl` or `~/.local/share/codex-quota-coach/history.jsonl`.

Only overview/status/forecast append snapshots, unless `--no-save`, `--raw` or `--offline` is used. Overview snapshots also retain the normalized activity data for offline reading. Status/forecast do not request token activity. Offline activity can reuse the newest account-matched activity snapshot, with its older timestamp disclosed.

Existing rows are never rewritten or deleted. Malformed rows are skipped with a warning. A damaged final line is preserved and the new snapshot starts on a new line. New data files/directories use restrictive permissions. Snapshots include the account ID for isolation; no login token, API key, prompt or conversation content is collected. A snapshot write failure does not hide a successful quota read.

Environment: `CODEX_QUOTA_HOME` overrides data storage; `CODEX_QUOTA_CODEX_BIN` overrides the Codex executable. Data collection is on demand; no schedule or background task is installed.

## Account read-only boundary

The transport permits only initialization and specific read methods. It blocks reset consumption, login/logout, billing changes, email nudges, task creation and model turns. Banked resets are used for informational advice only. The installed Codex process may perform its normal local runtime/auth bookkeeping when it starts; this tool issues no account-mutation RPC.

## Development

```sh
npm test
node codex-quota.mjs --no-save
```

No dependency installation is needed. Tests cover quota/account boundaries, sparse history and reset discontinuities, CLI/RPC failures, output contracts, offline mode, preserved history, and installer rollback assets. All automated tests use synthetic data and temporary directories; real account checks are separate.

Sources: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server), plus the locally generated experimental protocol schema for Codex CLI 0.154.0. Review findings and verification notes: [REVIEW.md](REVIEW.md).
