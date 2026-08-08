# Authentik identity provider

This stack runs Authentik and its dedicated PostgreSQL database alongside Northline. It is intentionally separate from Northline's application database and persistent volume.

## First deployment

From this directory on the Linux host:

```bash
umask 077
cp .env.example .env
PG_SECRET=$(openssl rand -hex 32)
AUTHENTIK_SECRET=$(openssl rand -hex 48)
sed -i "s|^PG_PASS=.*|PG_PASS=$PG_SECRET|" .env
sed -i "s|^AUTHENTIK_SECRET_KEY=.*|AUTHENTIK_SECRET_KEY=$AUTHENTIK_SECRET|" .env
unset PG_SECRET AUTHENTIK_SECRET
mkdir -p data certs custom-templates
docker compose pull
docker compose up -d
```

Open `http://<server>:9000/if/flow/initial-setup/` and create the initial `akadmin` password. Do not expose ports 9000 or 9443 directly to the public internet. Add HTTPS through a reverse proxy before remote use.

## Initial directory model

Create these groups in Authentik:

```text
Domain Users
├── Domain Admins
└── Northline Users
    └── Northline Admins
```

Keep Authentik's built-in `authentik Admins` group separate as a break-glass platform-administration role. Membership mapping for Northline will be:

- `Northline Admins` grants the Northline administrator role.
- `Northline Users` grants the normal Northline member role.
- `Domain Users` alone does not grant access to Northline.

Future applications should receive their own application-specific user and administrator groups under `Domain Users`.

## Operations

```bash
docker compose ps
docker compose logs --tail=100 server worker
docker compose pull
docker compose up -d
```

Back up both the `database` Docker volume and the `data` directory. The `.env` file contains credentials and must be stored securely outside Git as part of disaster-recovery documentation.

The worker has access to the Docker socket so Authentik can manage embedded outposts. Treat membership in the host's Docker group and changes to this Compose file as privileged infrastructure access.
