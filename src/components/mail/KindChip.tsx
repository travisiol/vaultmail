import { clsx } from "clsx";
import type { MessageKind } from "@/lib/protocol/types";

const LABEL: Record<MessageKind, string> = { message: "Message", invoice: "Invoice", request: "Request" };

export function KindChip({ kind, className }: { kind: MessageKind; className?: string }) {
  return <span className={clsx("chip", kind !== "message" && "text-ink-0", className)}>{LABEL[kind]}</span>;
}

export function kindLabel(kind: MessageKind): string {
  return LABEL[kind];
}
