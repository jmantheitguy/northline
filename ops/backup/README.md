# Northline backup and recovery

The production backup job creates a consistent SQLite snapshot of Northline, a logical PostgreSQL dump of Authentik, private environment files, Authentik-managed files, and the complete local mail stack. Mail coverage includes Stalwart configuration and message data, Bulwark webmail state, SnappyMail data, mail ingress configuration, and the mail Compose deployment. Mail containers are paused only while their small local volumes are captured, then restarted automatically even if the job fails. Each archive includes checksums and is encrypted with AES-256-CBC using PBKDF2.

The production systemd timer runs once daily with a randomized delay. Archives are stored in a root-only local backup directory with short retention, then each verified encrypted archive is replicated to a separately managed NAS destination with longer retention. Exact schedules, share names, mount details, and credentials are intentionally excluded from this public repository.

Each successful backup writes `runtime-status/backup.json`; each successful restore drill writes `runtime-status/restore.json`. The Northline container mounts this directory read-only and displays both reports in **Administration > Health**. `nasReplicated: true` confirms that a verified copy reached the NAS, not merely the VM.

The encryption key is stored separately at `/root/.config/northline-backup.key`. Losing both the VM and the off-host copy of this key makes the archives unrecoverable. Never commit the key or an archive to Git.

## Manual backup

```bash
sudo systemctl start northline-backup.service
sudo journalctl -u northline-backup.service --since today
```

## Non-destructive restore test

```bash
sudo /usr/local/sbin/northline-restore-test
```

The test decrypts the newest archive, verifies every checksum, opens the Northline database snapshot and runs its integrity check, validates every mail volume artifact, then restores Authentik into a temporary PostgreSQL database. It drops the temporary database afterward and never modifies production.

## Disaster recovery

1. Install Docker and clone the matching Northline release.
2. Restore the two environment files with mode `0600`.
3. Restore the Northline SQLite snapshot into the `northline-data` volume while the application container is stopped.
4. Start Authentik PostgreSQL, create an empty database, and import `authentik.sql`.
5. Restore Authentik files under `infra/authentik`, then start its server and worker.
6. Start Northline and verify Authentik sign-in, directory synchronization, board access, and Task Buddy.
7. Restore the five mail volumes while mail containers are stopped, then start Stalwart, webmail, and mail ingress and verify one account before reopening access.

An archive kept only on the application VM is not a complete disaster-recovery strategy. Copy encrypted archives to separate storage such as the NAS before relying on them for hardware failure recovery.

## NAS destination

The production VM uses a root-only credentials file and a systemd automount for its SMB backup destination, so boot is not blocked when the NAS is temporarily unavailable. Choose the newest protocol supported by both systems, disable SMB1, restrict the backup account to its destination, and never publish the NAS administration interface or SMB service to the internet.

The NAS contains encrypted archives only. The recovery key remains separate and must never be copied into the backup folder.

## What is protected

- Northline SQLite data, reminder history, notification snapshots, activity history, and workspace settings
- Authentik PostgreSQL, configuration, templates, profile media, and private environment file
- Stalwart configuration and message data
- Bulwark and SnappyMail state
- Mail ingress configuration and deployment files
- Checksums, container image references, and the exact Northline Git commit
