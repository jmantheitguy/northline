# Northline backup and recovery

The production backup job creates a consistent SQLite snapshot of Northline, a logical PostgreSQL dump of Authentik, private environment files, Authentik-managed files, and the complete local mail stack. Mail coverage includes Stalwart configuration and message data, Bulwark webmail state, SnappyMail data, mail ingress configuration, and the mail Compose deployment. Mail containers are paused only while their small local volumes are captured, then restarted automatically even if the job fails. Each archive includes checksums and is encrypted with AES-256-CBC using PBKDF2.

The systemd timer runs daily at 03:17 with a randomized delay of up to 20 minutes. Archives are stored in `/var/backups/northline` with owner-only permissions and retained for 14 days. Production also replicates each verified encrypted archive to the Synology `Data/Northline-Backups` folder and retains NAS copies for 60 days.

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

## NAS mount

The production VM mounts the Synology `Data` share at `/mnt/northline-backups` using a root-only credentials file. The older DS210j negotiates SMB 2.0 with NTLMSSP; SMB1 is not enabled. The persistent mount uses systemd automounting so boot is not blocked when the NAS is temporarily unavailable.

The NAS contains encrypted archives only. The recovery key remains separate and must never be copied into the backup folder.
