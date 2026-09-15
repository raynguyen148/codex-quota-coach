# v0.2 review and upgrade

Reviewed 2026-09-15. The installed v0.1 source matched the project source before changes. This directory was not a Git repository; no commit, branch or remote operation was performed.

## Confirmed v0.1 findings, addressed

| Finding | Effect | v0.2 change |
| --- | --- | --- |
| Normalization selected only the `codex` bucket | Omitted returned model-specific/other limits | Retain all buckets and expose `--limit` |
| History matching ignored account and plan | Could derive burn from unrelated snapshots | Isolate account, bucket, plan and exact cycle; no historical forecast without identity |
| Missing numbers passed through `Number()` or defaulted to zero | Unknown quota could appear unused; unknown reset count could appear empty | Validate types, preserve null/unknown values |
| No-recent-consumption intervals were rejected when delta was below one | Fell back to an older, faster window average during an idle period | Accept zero observed consumption with precision and confidence limits |
| Forecast used one start/end slope with loose reset matching | Hid recent changes; could span quota resets/corrections | Recency-weighted intervals, explicit coverage, discontinuity boundaries |
| One planning window governed advice; backend restrictions were ignored | Could encourage more use with a depleted short window or blocked account | Respect every window in the selected bucket and backend permission |
| Unknown burn still produced a projected remaining value | Implied a forecast without supporting measurements | Unknown projection remains null |
| Reset credits influenced recommendations | Introduced account actions outside this tool's intended role | Inventory only; transport blocks all mutation/inference methods |
| Only the last daily bucket was shown | Hid available daily history and account metrics | Daily chart, summaries, optional task breakdown |
| Unknown flags were silently accepted and history/doctor ignored JSON | Confusing commands and fragile automation | Validated CLI options and structured output/errors |
| Process cleanup tested `child.killed` instead of actual exit | Forced cleanup could fail after SIGTERM was sent | Inspect exit/signal state, bounded fallback kill, handle stream errors/timeouts |
| Installer overwrote one source file and modified shell startup files | No complete modular release or convenient rollback | Stage/verify complete release, preserve launcher, atomic switch |

## Confirmed data sources

- `account/rateLimits/read`: current authoritative quota, multiple buckets, backend usage permission, spend state, workspace credit and banked resets.
- `account/usage/read`: daily token buckets and account metrics. On the real account during review, it returned 117 daily rows, with the latest dated 2026-09-14. The main quota and one additional opaque bucket were present. These are observations at verification time, not permanent account guarantees.
- Generated `GetAccountTokenUsageParams`, `ThreadUsage` and `ThreadUsageBreakdownGroup` from the installed CLI expose optional task estimates grouped by model/reasoning/speed. The command handles absent estimates and does not discard the requested task ID on a compatibility retry.
- Local quota JSONL provides time-series snapshots without reading private conversation text. No session-log mining, credential parsing, reverse-engineered direct HTTP endpoint, paid inference, or new background service was added.

## Explicit limitations

- Token buckets have backend date labels and unspecified timezone/freshness/completeness. Today's missing bucket is not zero. The API/schema provides no stable token-to-quota conversion.
- Estimated task credit/USD fields are service estimates, not charges. They are kept in JSON without adding a pricing calculator.
- Forecast confidence is heuristic, and the displayed range is sensitivity to observed pace and measurement resolution. It is not a probability or guaranteed safe allowance.
- Few snapshots or long gaps reduce confidence. New windows and missing reset timestamps can make forecasts unavailable. Historical averages crossing a reset include only observed within-cycle intervals; the reset-crossing interval is omitted.
- Offline reports refer to the saved account and timestamp, and cannot confirm current account identity or permissions.
- The read-only account contract does not prevent the Codex executable from maintaining its own local runtime database during startup.

## Verification

- Automated tests exercise synthetic quota/account transitions, sparse/zero burn, backend denial, corrupted history, unsupported methods, process timeout/exit, JSON/plain/compact output and installation in temporary prefixes.
- Real app-server reads verify current quota, daily token history and rendered forecasts without an API key or any model call by this CLI.
- All 37 automated tests passed on Node.js 18. Checks include install/update in prefixes containing spaces and quotes, protection against overwriting unrelated commands, and validation of alternative-model advice.
- Installed v0.2.0 on Ray's Mac using a versioned release and preserved the v0.1 launcher for rollback. Both `cq` and `codex-quota` resolve through the new launcher.
- Installed-command live smoke checks passed for overview, doctor and compact status. Source-command live checks also passed for forecast and daily usage. Terminal output was inspected in a PTY and plain output at 48 columns.
- A real request for this task's usage returned no task estimate. The optional task-breakdown path is verified with synthetic integration data; its availability on this task is explicitly unconfirmed/unavailable, not represented as a token total.
- The existing seven-row history file remained byte-for-byte unchanged through review, installation and `--no-save` verification (SHA-256 `6c3355baa4b849b523fbbc055c1f78617dba89c96ed3288fb2664a6b97e35b20`). No real snapshot was appended by verification.
