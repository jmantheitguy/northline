# Security policy

## Supported version

Northline is currently in **Beta v0.0.2**. Only the latest tagged Beta release and latest commit on `main` receive security fixes during the Beta period.

## Security model

- Administrative routes require an active server-side Admin session.
- Board routes resolve owner, editor, or viewer access on the server for every request.
- Opaque board IDs prevent easy enumeration but are not considered authorization secrets.
- Sessions use random tokens; only SHA-256 token digests are stored in SQLite.
- Cookies are HTTP-only, same-site, and marked secure in HTTPS deployments.
- Passwords for emergency local accounts are hashed with bcrypt.
- Discord credentials, Authentik tokens, OIDC secrets, mail relay keys, and backup keys remain server-side.
- Response headers deny framing, disable MIME sniffing, restrict referrers, and disable unused browser permissions.
- Production dependency audits are required before each release.
- State-changing API requests are rejected when their browser origin is not Northline's configured origin.
- Sign-in and administrative mutation endpoints use bounded in-process throttling; upstream Cloudflare rate limits remain recommended for distributed protection.
- Users can inspect and revoke their own sessions without gaining access to another account's session records.

## Credential handling

- Never commit `.env` files, passwords, private keys, OAuth client secrets, API tokens, session data, database exports, or service configuration containing credentials.
- Commit only the provided `.env.example` templates, using unmistakable non-secret placeholders.
- Supply production secrets through the host environment or a secret manager.
- Rotate a credential immediately if it appears in Git history, application logs, screenshots, issue text, or chat.
- Keep Authentik, mail, Cloudflare, and Discord credentials separate so one disclosure does not compromise every service.

## Reporting a vulnerability

Do not open a public issue containing exploit details or credentials. Contact the repository owner privately with the affected version, reproduction steps, impact, and any suggested mitigation.
