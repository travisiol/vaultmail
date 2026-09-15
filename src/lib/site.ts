/**
 * The name and the words that carry it. Everything brand-shaped lives here so
 * a rename is one file.
 */
export const site = {
  name: "VAULT MAIL",
  wordmark: ["VAULT", "MAIL"] as const,
  hook: "Your wallet has an inbox.",
  tagline: "Send a message, an invoice or a payment request to any wallet. Sealed end-to-end. Settled onchain.",
  description:
    "VAULT MAIL is wallet-to-wallet mail. Any wallet can write to any other wallet: a message, an invoice, a payment request. Envelopes are sealed to the recipient's vault key and invoices are paid in one tap, with the receipt attached.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3990",
  twitter: "@vaultmail",
  version: "0.1",
} as const;
