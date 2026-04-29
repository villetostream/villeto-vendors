import { VilletoLogo } from "@/components/shared/VilletoLogo";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen onboarding-bg relative overflow-hidden">
      {/* Grid corner decorators — matches figma */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(43,185,176,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(43,185,176,0.15) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <VilletoLogo size="md" />
        {/* User email pill injected by child pages via slot */}
        <div id="onboarding-header-slot" />
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
