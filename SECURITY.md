# Security policy

## Supported version

Orbit is currently in **Alpha v0.1.0**. Only the latest commit on `main` receives security fixes during the alpha period.

## Credential handling

- Never commit `.env` files, passwords, private keys, OAuth client secrets, API tokens, session data, database exports, or service configuration containing credentials.
- Commit only the provided `.env.example` templates, using unmistakable non-secret placeholders.
- Supply production secrets through the host environment or a secret manager.
- Rotate a credential immediately if it appears in Git history, application logs, screenshots, issue text, or chat.
- Keep Authentik, mail, Cloudflare, and Discord credentials separate so one disclosure does not compromise every service.

## Reporting a vulnerability

Do not open a public issue containing exploit details or credentials. Contact the repository owner privately with the affected version, reproduction steps, impact, and any suggested mitigation.
