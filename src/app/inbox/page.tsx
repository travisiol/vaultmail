import type { Metadata } from "next";
import { InboxClient } from "@/components/app/InboxClient";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

export default function InboxPage() {
  return <InboxClient />;
}
