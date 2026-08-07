# VTuber Offices mail stack

This stack provides independent `@vtuberoffices.com` mailboxes without exposing the home VM directly to SMTP traffic.

## Data flow

Cloudflare Email Routing invokes the Worker for inbound mail. The Worker sends the original RFC 822 message through Cloudflare Tunnel to the authenticated ingress service. The ingress service validates the recipient domain and submits the message to Stalwart on its private Docker network. Bulwark Webmail connects to Stalwart over JMAP and supports Authentik OIDC sign-in.

## Private services

| Origin | Tunnel hostname | Purpose |
| --- | --- | --- |
| `http://192.168.0.62:8888` | `webmail.vtuberoffices.com` | User webmail |
| `http://192.168.0.62:8088` | `mail-admin.vtuberoffices.com` | Stalwart setup and administration |
| `http://192.168.0.62:8788` | `mail-ingress.vtuberoffices.com` | Worker delivery endpoint; do not expose to users |

All host bindings use loopback by default. If `cloudflared` runs on a different server, connect the two hosts with the existing private network and bind only the required ports to the VM's private address.

## Deployment

1. Copy `.env.example` to `.env` and generate `MAIL_INGRESS_TOKEN` with at least 32 random bytes.
2. Run `docker compose up -d`.
3. Complete Stalwart's initial wizard at the private administration URL using `vtuberoffices.com` as the default domain.
4. Configure Bulwark with Stalwart's JMAP endpoint and the dedicated Authentik OIDC provider.
5. Add the three accounts in Stalwart before enabling routing.
6. Add the three Tunnel hostnames above.
7. In `worker`, run `npm install`, set the shared secret with `npx wrangler secret put INGRESS_TOKEN`, and run `npm run deploy`.
8. Enable Cloudflare Email Routing and create a Worker routing rule for each mailbox.

Do not enable a catch-all rule. Unknown recipients should be rejected rather than accepted and later bounced.

## Outbound mail

Configure Stalwart to use a conventional authenticated SMTP relay for user correspondence. Cloudflare Email Sending is currently intended for transactional mail and should not be treated as the primary personal-mail relay.

## Backups

Back up all three named volumes. Stalwart configuration and message data must be restored together. Keep at least one encrypted copy outside the VM.
