import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { Identicon } from "@/components/Identicon";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { CopyLink } from "@/components/site/CopyLink";
import { explorerAddress } from "@/lib/chain";
import { checksum, dayLabel, shortAddress } from "@/lib/format";
import { isAddress, lower } from "@/lib/protocol/encoding";
import { getVault } from "@/lib/server/store";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: "Not a wallet" };
  return { title: `Write to ${shortAddress(address)}`, description: `Send ${shortAddress(address)} a message, an invoice or a payment request on ${site.name}.` };
}

/**
 * A wallet's public door: /to/0x… — share it and anyone can write to you,
 * bill you, or ask you. Says plainly whether a vault is open (mail will be
 * sealed) or not yet (mail will be sent unsealed).
 */
export default async function VaultPage({ params }: Params) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = lower(raw);
  const reg = getVault(address);
  const pretty = checksum(address);
  const explorer = explorerAddress(pretty);

  const actions = [
    { kind: "message", label: "Write a message", cls: "btn-mint" },
    { kind: "invoice", label: "Send an invoice", cls: "btn-glass" },
    { kind: "request", label: "Request a payment", cls: "btn-glass" },
  ];

  return (
    <>
      <Nav />
      <main className="shell flex min-h-[100svh] items-center justify-center pb-16 pt-[calc(var(--nav-h)+24px)]">
        <div className="glass glass-tile glass-lit relative w-full max-w-[560px] overflow-hidden px-7 py-10 text-center md:px-10">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,rgba(95,227,161,0.22),transparent)]" />
          <div className="relative">
            <div className="relative mx-auto w-fit">
              <EnvelopeMark size={120} id="vault-mark" />
              <span className="absolute -bottom-1 -right-1 rounded-full ring-4 ring-[#0a0f0c]">
                <Identicon address={address} size={38} className="block" />
              </span>
            </div>
            <p className="eyebrow mt-7">{reg ? "Vault open" : "No vault yet"}</p>
            <h1 className="addr mt-3 break-all text-[17px] text-ink-0 md:text-[19px]">{pretty}</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-1">
              {reg
                ? `This wallet opened its vault${reg.registeredAt ? ` on ${dayLabel(reg.registeredAt)}` : ""}. Anything you send is sealed to its key — the server carries it and cannot read it.`
                : "This wallet has not opened a vault on this deployment. You can still write; the envelope will be sent unsealed and marked as such until they open one."}
            </p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {actions.map((a) => (
                <Link key={a.kind} href={`/compose?to=${address}&kind=${a.kind}`} className={`btn ${a.cls}`}>
                  {a.label}
                </Link>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-ink-3">
              <CopyLink path={`/to/${address}`} />
              {explorer && (
                <a href={explorer} target="_blank" rel="noreferrer" className="hover:text-ink-0">
                  Explorer ↗
                </a>
              )}
              <Link href="/inbox" className="hover:text-ink-0">
                Is this you? Open your inbox
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
