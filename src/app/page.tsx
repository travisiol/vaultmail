import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/site/Hero";
import { Nav } from "@/components/site/Nav";
import { RevealObserver } from "@/components/site/RevealObserver";
import { ClosingSection, FaqSection, HowSection, KindsSection, PreviewSection, SealedSection } from "@/components/site/Sections";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <KindsSection />
        <HowSection />
        <PreviewSection />
        <SealedSection />
        <FaqSection />
        <ClosingSection />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
