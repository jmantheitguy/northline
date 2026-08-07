interface Env {
  DELIVERY_URL: string;
  MAIL_DOMAIN: string;
  INGRESS_TOKEN: string;
}

export default {
  async email(message, env): Promise<void> {
    const recipient = message.to.toLowerCase();
    if (!recipient.endsWith(`@${env.MAIL_DOMAIN.toLowerCase()}`)) {
      message.setReject("Recipient domain is not served here");
      return;
    }
    const response = await fetch(env.DELIVERY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.INGRESS_TOKEN}`,
        "Content-Type": "message/rfc822",
        "X-Envelope-From": message.from,
        "X-Envelope-To": message.to,
      },
      body: message.raw,
    });
    if (!response.ok) throw new Error(`Private mail delivery returned ${response.status}`);
  },
} satisfies ExportedHandler<Env>;

