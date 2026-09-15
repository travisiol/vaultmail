import { notFound } from "next/navigation";
import { GlassLab } from "@/components/lab/GlassLab";

/** Dev only: side-by-side variants of the hero object. Not part of the product. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlassLab />;
}
