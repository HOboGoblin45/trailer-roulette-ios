# Bug log

Active during Phase 5 (Testing) onward. Format below; one row per bug.

## Open
| ID | Severity | Summary | Repro | Owner | Status |
|----|----------|---------|-------|-------|--------|
| _none yet_ |

## Closed
| ID | Severity | Summary | Resolution | Closed |
|----|----------|---------|------------|--------|
| B1 | S2 | YouTube trailers played ~15s then auto-advanced to the next one | Root cause: pre-roll ad ends fire onStateChange ENDED(0) before the real trailer plays, and every path advanced on the raw event. Added ad-aware end detection (progress fast-path + resume-confirm) in `src/lib/endDetection.js` (web), `TrailerPlayer.swift` (iOS), and `landing-page/api/embed.js` (proxy). v3.1.0. | 2026-07-07 |

## Severity rubric
- **S1 (block submission)** — crash on launch, data loss, App Review flag
- **S2 (block release)** — major feature broken on a common device
- **S3 (fix in v1.1)** — minor visual or non-blocking interaction issue
- **S4 (nice to have)** — polish, copy, edge case
