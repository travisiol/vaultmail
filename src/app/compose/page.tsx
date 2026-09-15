import type { Metadata } from "next";
import { ComposeClient } from "@/components/app/ComposeClient";

export const metadata: Metadata = { title: "Compose", robots: { index: false } };

export default function ComposePage() {
  return <ComposeClient />;
}
