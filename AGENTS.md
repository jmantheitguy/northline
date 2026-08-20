<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Northline development rules

Northline is a production application with real users and data. Before making
changes, read `docs/LOCAL-MODEL-RUNBOOK.md` and the relevant public project
documentation it references. Use `docs/ENGINEERING-MAP.md` to locate the narrow
implementation and validation path before broad repository searches.

- Treat authorization as a server-side boundary. Never infer access from the
  interface, an opaque identifier, a role label, or a client-supplied owner ID.
- Preserve production data and use forward-only, additive schema migrations.
- Do not deploy, push, tag, announce a release, rotate credentials, modify
  Authentik/Discord/Cloudflare/AWS, or run a production migration unless the
  user explicitly authorizes that action in the current conversation.
- Never print, paste, commit, summarize, or place secrets in prompts. Use the
  existing environment, SSH configuration, credential helpers, and provider
  CLIs without revealing their values.
- Inspect the current Git status before edits and preserve unrelated changes.
- Use `apply_patch` for hand edits. Run focused validation while iterating;
  do not run the full security suite after every small change. Use the complete
  release checklist only for a release candidate or when explicitly asked.
- Diagnose before editing. For a bug, reproduce or obtain concrete evidence,
  trace the UI-to-route-to-domain-helper path, and add a regression test that
  fails for the original behavior whenever practical.
- Do not weaken, bypass, or replace an authorization check to make a test or UI
  flow pass. Treat authenticated-but-unauthorized cases as required coverage.
