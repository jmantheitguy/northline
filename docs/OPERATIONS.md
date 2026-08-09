# Northline operations guide

## Deploy and update

Northline targets a Linux VM with Docker Compose. Keep SQLite and live mail data on local VM storage; use the NAS for encrypted backups. Configure the private `.env`, run `docker compose up -d --build`, publish port 3000 through Cloudflare Tunnel, and restrict direct origin access to the private network.

For updates, review the release notes, confirm a current NAS backup, pull the tagged/current `main`, rebuild, and complete the release checklist. The application performs additive SQLite schema initialization at startup.

## Health dashboard

Open **Administration > Health**. Healthy production should show SQLite `ok`, adequate VM free space, Authentik configured, Task Buddy reachable, no unexplained failed reminders, a recent backup with NAS replication, and a recent successful restore test. The Task Buddy test sends a real message to the most recently configured board channel and records an audit event.

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
curl -I http://127.0.0.1:3000/
sudo systemctl list-timers northline-backup.timer
sudo journalctl -u northline-backup.service --since today
sudo /usr/local/sbin/northline-restore-test
```

Never paste live environment values, OAuth secrets, bot tokens, mail keys, backup keys, or NAS credentials into issues or logs. Rotate any secret that is exposed.

## Remaining Beta acceptance gate

Automated non-browser validation cannot establish visual correctness, keyboard usability, focus behavior, screen-reader output, or responsive layout quality. Before Beta, a human must execute the journeys in `docs/BETA-ACCEPTANCE.md` with browser access and record failures. Alpha v0.8.0 deliberately reports this as pending instead of claiming unperformed browser validation.

## Public documentation boundary

This repository deliberately documents service roles and safe deployment patterns without publishing production IP addresses, origin ports, internal DNS names, NAS paths, account names, exact backup times, Cloudflare account identifiers, Discord guild/channel identifiers, or recovery contacts. Operators should maintain those values in a private runbook stored separately from the source repository.
