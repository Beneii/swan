# Verification and limitations

## Public source verification

`npm test` passed 38 tests in 12 self-contained files on Windows with Node.js 24.13.0. These cover integration ownership, worker capacity and reuse, lifecycle state, process identity, repository isolation, task validation, acceptance invalidation, subscription-environment sanitization, failure holds, MCP schema and report scheduling.

The runner prints 11 excluded desktop-dependent test files. These require proprietary contract modules or local fixtures that are deliberately absent. Passing the public suite is not a desktop end-to-end result. GitHub Actions is configured to run this same subset on Windows; consult the actual workflow result for remote status.

The complete private local adaptation previously passed 82 deterministic checks and exercised native crew replies, task review, daily reports, report scheduling, search and a combined-work pilot. Those local results are historical evidence, not a reproducible public binary release.

## Still incomplete

- Native new-thread creation through a real first reply, restart and conversation restoration.
- Broader ordinary-user routing across brainstorming, deferred capture, implementation and worker reuse.
- Multiple outstanding product questions and clarification of ambiguous replies.
- Direct worker intervention followed by complete coordinator reconciliation and next-day restoration.
- Live Captain delivery request and native confirmation backed by actually completed delivery.

Simultaneously attaching an interactive terminal to a controlled session has not been verified. Several inherited cloud integrations remain unsupported. The scheduler requires the machine awake with the runtime running and does not wake the computer. Windows is the tested platform.

## Publication boundary

This repository contains custom backend source, tests, three reviewed UI screenshots and documentation. It excludes application binaries, Capy's renderer/schema bundles, extracted vendor code, credentials, user records, account settings images and generated private workspaces. No installer or release archive is supplied.
