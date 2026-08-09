# VTuber Offices mail stack

This stack provides independent domain mailboxes without exposing the origin VM directly to public SMTP traffic. Replace all `example.com` values below with the deployment domain in private configuration.

## Data flow

Cloudflare Email Routing invokes the Worker for inbound mail. The Worker sends the original RFC 822 message through Cloudflare Tunnel to the authenticated ingress service. The ingress service validates the recipient domain and submits the message to Stalwart on its private Docker network. Bulwark Webmail connects to Stalwart over JMAP and supports Authentik OIDC sign-in.

## Private services

| Private origin | Public hostname | Purpose |
| --- | --- | --- |
| `http://<private-mail-host>:<webmail-port>` | `webmail.example.com` | User webmail |
| `http://<private-mail-host>:<jmap-port>` | `mail.example.com` | Public JMAP endpoint used by webmail |
| `http://<private-mail-host>:<ingress-port>` | `mail-ingress.example.com` | Worker delivery endpoint; do not advertise to users |

Webmail's public JMAP URL is `https://mail.example.com`. The Cloudflare Tunnel route for that hostname must target Stalwart's private HTTP/JMAP listener. Keep the real private address and port in a separate operator runbook.

All host bindings use loopback by default. If `cloudflared` runs on a different server, connect the two hosts with the existing private network and bind only the required ports to the VM's private address.

## Deployment

1. Copy `.env.example` to `.env`, generate `MAIL_INGRESS_TOKEN` with at least 32 random bytes, and set `BREVO_SMTP_KEY` to a dedicated Brevo SMTP key.
2. Run `docker compose up -d`.
3. Complete Stalwart's initial wizard at the private administration URL using the deployment domain as the default domain.
4. Configure Bulwark with Stalwart's JMAP endpoint and the dedicated Authentik OIDC provider.
5. In Stalwart, configure CORS for the exact separate `webmail.example.com` origin so webmail can access JMAP. Avoid a permissive wildcard in production when the installed Stalwart release supports an explicit allowed-origin list.
6. Add the three accounts in Stalwart before enabling routing.
7. Add the three Tunnel hostnames above.
8. In `worker`, run `npm install`, set the shared secret with `npx wrangler secret put INGRESS_TOKEN --config wrangler.jsonc`, and run `npm run deploy -- --config wrangler.jsonc`.
9. Enable Cloudflare Email Routing and create an exact-recipient Worker rule for each mailbox.
10. Publish DMARC in monitoring mode before moving to quarantine or rejection after reports confirm SPF and DKIM alignment.
11. If the ingress architecture makes a second Stalwart source-IP reputation scan invalid, create the narrowest possible DATA-stage exception for the authenticated private ingress identity. Keep the exact identity private and preserve normal scanning for every other unauthenticated session.

Do not enable a catch-all rule. Unknown recipients should be rejected rather than accepted and later bounced.

### Inbound spam boundary

Cloudflare Email Routing has already handled the public SMTP connection before the Worker forwards the original message. Stalwart otherwise sees the private ingress container as the sending server, which makes source-IP SPF, reverse-DNS, and reputation checks misleading. The DATA-stage exception therefore skips the redundant Stalwart scan only for the ingress bridge's fixed EHLO identity. Port 25 remains private to the Docker network, and normal spam filtering remains enabled for all other unauthenticated sessions.

## Outbound mail

Stalwart uses a relay route named `brevo` for recipients outside the local domain. The route connects to `smtp-relay.brevo.com:587` with STARTTLS and reads its authentication secret from the `BREVO_SMTP_KEY` container environment variable. Local recipients continue to use Stalwart's `local` route.

Authenticate the deployment domain in the relay provider with its verification and DKIM records. Preserve Cloudflare Email Routing's SPF record and the domain's existing DMARC record; do not replace either with a second SPF or DMARC record.

Keep the generated SMTP key only in the server-side `.env`. Never commit the live key, paste it into Stalwart's stored configuration, or expose it in command output. Restart the Stalwart service after rotating the key so the new environment value is loaded.

## Backups

Back up all three named volumes. Stalwart configuration and message data must be restored together. Keep at least one encrypted copy outside the VM.

Keep the live Stalwart database, queues, and message blobs on the VM's local disk. A NAS is appropriate as an encrypted backup destination, but network-attached storage—especially older hardware—should not be the primary live mail datastore.

## Current mailbox model

Mailboxes are independent accounts hosted by Stalwart. Authentik OIDC provides the webmail sign-in experience; it does not itself store or deliver mail. Cloudflare Tunnel publishes HTTPS/JMAP and webmail traffic, while inbound SMTP terminates at Cloudflare Email Routing. Outbound external delivery uses Brevo so the residential connection does not need public port 25, static reverse DNS, or direct sender reputation.

The administration health dashboard belongs to Northline and does not replace Stalwart delivery logs, Cloudflare Email Routing analytics, or Brevo delivery events. Use those systems when diagnosing a specific message.
