# v0.2 review and upgrade

## v0.4.2 scan-first terminal overview

- Reworked `cq` into a compact status → quota → pace → advice layout with semantic terminal colors and a shorter two-command drill-down footer.
- The normal text views now focus on the core `codex` bucket. Secondary model buckets such as GPT-5.3-Codex-Spark remain available through an explicit `--limit` and in unchanged JSON/raw data.
- Removed token activity, workspace-credit details, repeated reset methodology and quota-unit explanations from the default overview. Focused `forecast`, `resets` and `usage` commands retain the deeper evidence.
- Added regression coverage for the concise hierarchy, narrow terminals, color/plain modes, secondary-bucket hiding and explicit selection.

## v0.3 reset advisor

Added on 2026-09-15 in response to the request for strictly read-only reset recommendations. Advice uses weighted quota history, observed quota deltas within the local day, known credit expiry, and natural-reset timing. `cq resets` now shows the detailed evidence; overview and forecast also include the advisor. The previous inventory-only decision is superseded; the transport's mutation/inference block is unchanged.

Safeguards cover unknown identity/count/expiry/type, partial inventory, duplicate/conflicting IDs, expired or future-granted rows, stale/offline state, workspace restrictions, natural resets, early-day bursts, zero usage, quota corrections, DST, and multiple credits competing for the same demand. The 10% trigger is an advisory policy, not a confirmed backend eligibility flag. Excess-credit numbers are explicitly hypothetical full-refill scenarios, not guaranteed waste or actual redemption counts.

Validation: 65 automated tests passed, including an RPC trace proving `cq resets` sends only initialization and `account/rateLimits/read`, plus unchanged-history checks. A live source-command read returned valid expiry dates and a partial within-day quota measurement; October credit deadlines were subsequently bounded out of the seven-day forecast and covered by regression testing. No reset was consumed. Installation verification uses `--no-save` or the non-saving `resets` command.

The workspace now has a Git repository (baseline `ceb040b`); this feature does not commit or push changes. The original v0.2 review below describes the workspace as it existed at that earlier point.

## Original v0.2 review

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
| Reset advice and account actions were not clearly separated | Read-only advice was initially removed together with account actions | v0.2 exposed inventory only; v0.3 restores informational advice while all mutation/inference methods remain blocked |
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

## v0.4.1 quick status highlight

- Added an upfront risk badge, emphasized pace, no-reset budget comparison, evidence confidence and immediate action. Overview avoids repeating the long strategy paragraph; forecast retains it.
- Current risk is independent of unused reset credits. Weak evidence and cached snapshots cannot display a green forecast. Core windows take priority over unrelated model buckets; exhausted windows and backend restrictions remain dangerous.
- All 78 tests pass, including risk categories, limiting-window selection, reset advice integration, 48-column wrapping, colored badges, plain mode and NO_COLOR. Source live overview verified the high-risk case against the real app-server using `--no-save`.

## v0.4 sequential reset planning

- Replaced repeated per-credit first-depletion dates with expiry-ordered, dependent scenarios. Skipped credits do not refill quota; shared low windows consume only one hypothetical credit. Average/slower/faster/today-adjusted scenarios stop at the first known natural refresh or seven days.
- Added a unified conditional recommendation while retaining unchanged no-reset quota budgets and assessments. No extra account RPC, model call or account mutation was added.
- Eligibility and full-refill effects remain unverified assumptions. Credit selection and natural deadlines must be checked again after any real reset. Low-confidence timelines are labeled illustrations and cannot relax the baseline conservation recommendation.
- Regression coverage includes the Jan 1 example with Jan 2/4/5 expiries at 5/20/50 percentage points per day, skipped credits, shared windows, expiry margin, natural refresh boundaries, uncertain evidence and midnight pace changes.
- Source live reset read succeeded against the installed Codex app-server on Sep 15. Current history produced low-confidence fallback pace with a discontinuity, so advice correctly requested more evidence instead of promoting the hypothetical timeline into a recommendation.
- The subsequent installed overview read returned medium-confidence recent pace and correctly presented a conditional reset check alongside the unchanged no-reset budget. Midnight times use 00:xx rather than ambiguous 24:xx. The 75-test suite passes; live checks use `--no-save` and preserve the history checksum.

## Earlier v0.2 verification

- Automated tests exercise synthetic quota/account transitions, sparse/zero burn, backend denial, corrupted history, unsupported methods, process timeout/exit, JSON/plain/compact output and installation in temporary prefixes.
- Real app-server reads verify current quota, daily token history and rendered forecasts without an API key or any model call by this CLI.
- All 37 automated tests passed on Node.js 18. Checks include install/update in prefixes containing spaces and quotes, protection against overwriting unrelated commands, and validation of alternative-model advice.
- Installed v0.2.0 on Ray's Mac using a versioned release and preserved the v0.1 launcher for rollback. Both `cq` and `codex-quota` resolve through the new launcher.
- Installed-command live smoke checks passed for overview, doctor and compact status. Source-command live checks also passed for forecast and daily usage. Terminal output was inspected in a PTY and plain output at 48 columns.
- A real request for this task's usage returned no task estimate. The optional task-breakdown path is verified with synthetic integration data; its availability on this task is explicitly unconfirmed/unavailable, not represented as a token total.
- The existing seven-row history file remained byte-for-byte unchanged through review, installation and `--no-save` verification (SHA-256 `6c3355baa4b849b523fbbc055c1f78617dba89c96ed3288fb2664a6b97e35b20`). No real snapshot was appended by verification.
