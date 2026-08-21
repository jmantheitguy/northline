# Northline backup and recovery

The self-hosted fallback backup job protects Northline only. It creates a
consistent snapshot of the fallback SQLite database, includes Northline's
private environment configuration and the exact deployed Git commit, records
checksums, and encrypts the archive with AES-256-CBC using PBKDF2. Railway
production uses managed PostgreSQL backups and its provider recovery workflow;
this host script is not a production PostgreSQL backup. It does not back up,
pause, or otherwise operate on Authentik or the mail stack.

The self-hosted fallback systemd timer runs once daily with a randomized delay
and retains the four newest encrypted archives in the configured local
destination. The script can optionally copy to a separately mounted destination
and/or a private S3 prefix. Exact schedules, paths, bucket names, and
credentials are intentionally excluded from this public repository.

Each successful backup writes `runtime-status/backup.json`; each successful restore drill writes `runtime-status/restore.json`. The Northline container mounts this directory read-only and displays both reports in **Administration > Health**. `nasReplicated: true` confirms that a verified copy reached the NAS, while `s3Replicated: true` confirms that S3 reported the same object size as the local encrypted archive.

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

The test decrypts the newest archive, verifies every checksum and the Northline-only manifest, confirms that the private configuration is present, and opens the SQLite snapshot to run its integrity check. It never modifies production.

## Disaster recovery

1. Install Docker and clone the matching Northline release.
2. Restore the two environment files with mode `0600`.
3. For the self-hosted fallback only, restore the Northline SQLite snapshot into
   the `northline-data` volume while the application container is stopped.
4. Restore the Northline environment file with mode `0600`.
5. Start Northline and verify sign-in, directory synchronization, board access, timers, and Task Buddy.

Authentik and mail require their own independent recovery strategy because they are intentionally outside this job's scope.

An archive kept only on the application VM is not a complete disaster-recovery strategy. Copy encrypted archives to separate storage such as the NAS before relying on them for hardware failure recovery.

## NAS destination

The production VM uses a root-only credentials file and a systemd automount for its SMB backup destination, so boot is not blocked when the NAS is temporarily unavailable. Choose the newest protocol supported by both systems, disable SMB1, restrict the backup account to its destination, and never publish the NAS administration interface or SMB service to the internet.

The NAS contains encrypted archives only. The recovery key remains separate and must never be copied into the backup folder.

## S3 destination

Set `NORTHLINE_S3_URI` to a private `s3://` prefix in the service's host-only configuration. The host identity needs only list access to that prefix plus permission to upload and verify its objects. Keep public access blocked, enable bucket encryption and versioning, and use lifecycle rules to archive or expire older backups. Never commit the bucket name, AWS credentials, or encryption key.

## What is protected

- Northline SQLite data, reminder history, notification snapshots, activity history, and workspace settings
- Northline private environment configuration
- Checksums, container image references, and the exact Northline Git commit
