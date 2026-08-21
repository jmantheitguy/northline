# Northline operations guide

## Deploy and update

Northline production runs on Railway from the protected `main` branch, with its
production PostgreSQL service and Authentik services in the same Railway
environment. The Docker Compose path remains available for local development
and a self-hosted fallback; keep live SQLite data on that host's local Docker
volume and never use a network share as live SQLite storage.

Code push, production deployment, database migration, and Discord release
announcement are separate actions. A normal local development update is:

1. Review the diff and run the relevant local validation.
2. Commit the reviewed change and push the intended commit to `main`.
3. Wait for Railway's `northline-staging / production` deployment status to
   report success and for `/health` to return HTTP 200.
4. Confirm the GitHub **Announce completed Railway releases** workflow reports
   success. It sends the text-only Task Buddy announcement to every configured
   release channel after Railway finishes, not merely after a code push.
5. Confirm a recent successful backup and restore test in **Administration >
   Health**. Use the self-hosted procedure below only when intentionally
   deploying the Compose fallback.

For the self-hosted Compose fallback, `sh ops/release/deploy-production.sh`
runs `git pull --ff-only`, rebuilds and starts the service, waits for Docker's
`northline` health status, prunes disposable build cache, and then sends one
GitHub-style Task Buddy announcement to each configured channel. Per-channel
markers make retries safe, even if one Discord destination was temporarily
unavailable. `NORTHLINE_RELEASE_CHANNEL_ID` remains supported for a single
channel. Ordinary GitHub pushes remain silent until that commit is deployed.
Application startup performs additive schema initialization for the selected
database driver.

### Save protection during rollouts

The browser treats a 502, 503, or 504 from a mutating API request as a
short-lived deployment interruption and retries it for up to several seconds.
If the replacement service is not ready by then, the current form remains in
the page and Northline reports that the save was not confirmed so the user can
retry it. Network errors are not automatically replayed because a server may
have committed the write before the response was lost. Users should only leave
the page after a visible success confirmation.

## Health dashboard

Open **Administration > Health**. Healthy production should show the database
`ok`, adequate Railway or VM storage, Authentik configured, Task Buddy reachable, no
unexplained failed reminders, a recent backup with verified off-host replication,
and a recent successful restore test. The Task Buddy test sends a real private
message to the linked Discord account of the administrator running the check and
records an audit event.

## Routine schedule

- Daily: automated encrypted full-stack backup with a randomized delay.
- Weekly: inspect Administration Health, failed reminders, disk growth, and container status.
- Monthly: run the non-destructive restore test and review OS/container updates.
- Every release: lint, build, tests, production audit, secret scan, documentation update, tagged GitHub push, VM deployment, and smoke test.
- Every pull request: GitHub CI repeats lint, build/tests, secret scanning, production audit, performance regression, and a disposable clean installation.

## Useful checks

```bash
docker compose ps
docker logs --tail 100 northline
docker inspect --format '{{.State.Health.Status}}' northline
sudo systemctl list-timers northline-backup.timer
sudo journalctl -u northline-backup.service --since today
sudo /usr/local/sbin/northline-restore-test
```

Successful production deployments remove unused Docker build cache after the replacement container becomes healthy. Running images, containers, named volumes, and application data are not part of that cleanup. The host also runs periodic filesystem TRIM so discarded guest blocks can be reclaimed by compatible thin-provisioned virtualization storage.

Never paste live environment values, OAuth secrets, bot tokens, mail keys, backup keys, or NAS credentials into issues or logs. Rotate any secret that is exposed.

## Remaining Beta acceptance gate

Automated non-browser validation cannot establish visual correctness, keyboard usability, focus behavior, screen-reader output, or responsive layout quality. During Beta, humans execute the journeys in `docs/BETA-ACCEPTANCE.md`, record failures, and repeat affected journeys before a stable release. Northline reports unperformed browser validation as pending instead of implying it passed.

## Public documentation boundary

This repository deliberately documents service roles and safe deployment patterns without publishing production IP addresses, origin ports, internal DNS names, NAS paths, account names, exact backup times, Cloudflare account identifiers, Discord guild/channel identifiers, or recovery contacts. Operators should maintain those values in a private runbook stored separately from the source repository.
