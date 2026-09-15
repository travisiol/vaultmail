import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { RevealObserver } from "@/components/site/RevealObserver";
import { chain } from "@/lib/chain";
import { LIMITS } from "@/lib/protocol/types";

export const metadata: Metadata = {
  title: "Protocol",
  description: "How VAULT MAIL derives keys from a wallet signature, seals envelopes, authenticates requests and verifies payment receipts. Version 1.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="scroll-thin glass glass-quiet mt-4 overflow-x-auto rounded-[14px] p-4 text-[12.5px] leading-relaxed text-ink-1">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="reveal grid gap-6 border-t border-[var(--line)] py-12 md:grid-cols-[180px_1fr]">
      <div>
        <p className="num text-[13px] text-mint-2">{n}</p>
        <h2 className="mt-2 text-[24px]">{title}</h2>
      </div>
      <div className="max-w-[68ch] text-[15px] leading-relaxed text-ink-1 [&_p+p]:mt-4 [&_strong]:font-medium [&_strong]:text-ink-0">{children}</div>
    </section>
  );
}

/** The whole design, in the order it happens. What the code does, not what it hopes. */
export default function ProtocolPage() {
  return (
    <>
      <Nav />
      <main className="shell pb-16 pt-[calc(var(--nav-h)+56px)]">
        <div className="reveal is-in max-w-[720px]">
          <p className="eyebrow mb-4">Protocol · version 1</p>
          <h1 className="display display-lg">Sealed, signed, settled.</h1>
          <p className="lede mt-5">
            Everything below is what the client and the server actually do — the same functions run in the browser, in the route handlers and in the test suite. Nothing here requires
            trusting the server for confidentiality or authenticity; it is trusted for delivery and for being honest about its own storage.
          </p>
        </div>

        <div className="mt-12">
          <Section n="01" title="Keys from a signature">
            <p>
              A wallet unlocks its vault by signing a fixed text with <code className="font-mono text-[13px] text-ink-0">personal_sign</code>. Ethereum wallets sign deterministically (RFC 6979),
              so the same wallet always produces the same bytes. The signature is hashed into a seed and expanded with HKDF into two keys:
            </p>
            <Code>{`seed      = SHA-256("vaultmail/seed/v1" || signature)
sealPriv  = HKDF-SHA256(seed, salt="vaultmail", info="seal/x25519/v1", 32)   → x25519
signSeed  = HKDF-SHA256(seed, salt="vaultmail", info="sign/ed25519/v1", 32)  → ed25519`}</Code>
            <p>
              The keys live in the tab&apos;s memory and are never stored or sent. Closing the tab locks the vault; signing again reopens the same one. <strong>The unlock signature is the
              secret</strong>: the text says so, and it should never be signed anywhere but here.
            </p>
          </Section>

          <Section n="02" title="The registry">
            <p>
              The first time, the wallet also signs a registration naming its two public keys. The server stores it and serves it to anyone: <code className="font-mono text-[13px] text-ink-0">GET /api/keys/0x…</code>.
              Before sealing to a recipient, a client can verify that record with nothing but the wallet address — the server cannot forge or swap a key without the wallet&apos;s private key.
            </p>
            <Code>{`{ v: 1, address, sealPub, signPub, walletSig }   // walletSig = personal_sign(registrationMessage(address, sealPub, signPub))`}</Code>
            <p>
              A wallet whose signatures are not deterministic (some hardware and smart-contract wallets) derives different keys on a later day. The client compares them with the registry and says
              so; republishing is the user&apos;s explicit choice, and older mail sealed to the previous key will not open.
            </p>
          </Section>

          <Section n="03" title="Envelopes">
            <p>An envelope is a cleartext header, a sealed body, one wrapped content key per reader, and the sender&apos;s signature over all of it.</p>
            <Code>{`header  = { v: 1, id, from, to, createdAt }              // id: 16 random bytes, chosen by the sender
K       = 32 random bytes
ct      = XChaCha20-Poly1305(K, nonce, JSON(payload), aad = canonical(header))
for R in { to, from }:
  eph      = x25519 keypair
  shared   = x25519(eph.priv, R.sealPub)
  wrapKey  = HKDF-SHA256(shared, salt = eph.pub || R.sealPub, info = "vaultmail/wrap/v1", 32)
  keys[R]  = { eph: eph.pub, nonce, box: XChaCha20-Poly1305(wrapKey, nonce, K, aad) }
sig     = Ed25519(signSeed, SHA-256(canonical({ ...header, sealed: true, nonce, ct, keys })))`}</Code>
            <p>
              The associated data binds the ciphertext to its header: change <em>from</em>, <em>to</em>, <em>id</em> or the date and the envelope no longer decrypts. The signature binds
              the sender: the server checks it against the sender&apos;s registered sign key before storing, and the reader checks it again before trusting who wrote it.
            </p>
            <p>
              <strong>Sealed:</strong> subject, body, kind, amount, token, due date, line items, invoice number, and which envelope a reply answers. <strong>In the clear:</strong> the two addresses,
              the timestamp, the flag, and the receipts.
            </p>
            <p>
              When the recipient has no vault, there is no key to seal to. The sender is told, and may send the envelope <em>unsealed</em>: same header, same signature, the payload in plain
              JSON, <code className="font-mono text-[13px] text-ink-0">sealed: false</code>. The server refuses an unsealed envelope to a wallet that has a vault, so a conversation is never quietly
              downgraded.
            </p>
          </Section>

          <Section n="04" title="Authenticated requests">
            <p>
              Reading an inbox, sending, marking read and attaching receipts are signed with the vault&apos;s ed25519 key — no session, no cookie, no server secret. The server looks the key up
              by address and verifies; the same request verifies on any instance that has the registry.
            </p>
            <Code>{`x-vault-address  the wallet
x-vault-ts       unix ms, within ±${LIMITS.requestSkewMs / 60000} minutes of the server clock
x-vault-nonce    8 random bytes
x-vault-sig      Ed25519(signSeed, SHA-256("METHOD\\npath?query\\nts\\nnonce\\nSHA-256(body)"))`}</Code>
            <p>Replaying a captured request inside the window re-does something idempotent: reads, mark-as-read, or an insert keyed by the envelope&apos;s own id.</p>
          </Section>

          <Section n="05" title="Payments and receipts">
            <p>
              An invoice or a request is paid with an ordinary transfer on {chain.name} — native currency or an ERC-20 <code className="font-mono text-[13px] text-ink-0">transfer</code> — from the
              recipient&apos;s wallet straight to the sender&apos;s. No contract of ours sits in between, no fee is taken, nothing is held.
            </p>
            <p>
              The payer then hands the transaction hash to <code className="font-mono text-[13px] text-ink-0">POST /api/messages/:id/receipts</code>. The server reads the transaction and its receipt
              from its own RPC and records it only if it succeeded, was sent by the envelope&apos;s recipient and moved value to the envelope&apos;s sender. One transaction pays one envelope.
            </p>
            <p>
              The <em>requested</em> amount is sealed, so the server never compares it; it records what was paid, and each side&apos;s client — which can open the envelope — shows paid in full,
              partly paid, or due.
            </p>
          </Section>

          <Section n="06" title="Limits and what is not claimed">
            <p>
              Payload up to {LIMITS.payloadBytes / 1024} KB, subject {LIMITS.subjectChars} characters, body {LIMITS.bodyChars.toLocaleString("en-US")}, {LIMITS.items} line items. The server sees
              who writes to whom and when — this is mail, not a mixnet. It can refuse to deliver, or lose what it holds; it cannot read, forge or re-address. Vault keys are only as safe as the
              device that derives them and the wallet that signs.
            </p>
            <p>
              Storage is the deployment&apos;s: <Link href="/api/health" className="text-ink-0 underline decoration-[var(--rim-2)] underline-offset-4">/api/health</Link> says whether it survives a
              restart.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
