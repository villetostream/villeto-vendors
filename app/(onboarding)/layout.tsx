import { VilletoLogo } from "@/components/shared/VilletoLogo";
import { OnboardingCompanySwitcher } from "@/components/onboarding/OnboardingCompanySwitcher";
import { LayoutStepper } from "@/components/onboarding/LayoutStepper";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col onboarding-bg relative overflow-hidden">
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

      {/* Top nav — always visible, never scrolls */}
      <header className="shrink-0 relative z-10 flex items-center justify-between px-6 py-5">
        <VilletoLogo size="md" />
        <div className="flex items-center gap-3">
          {/* Company switcher — visible when vendor belongs to multiple orgs.
              Allows switching from /pending (one company) to the active
              dashboard (another company) without logging out. */}
          <OnboardingCompanySwitcher />
          {/* User email pill injected by child pages via slot */}
          <div id="onboarding-header-slot" />
        </div>
      </header>

      {/* Step progress — auto-shows on wizard pages, hidden on /invite and /signup */}
      <LayoutStepper />

      {/* Main content — pages handle their own scrolling if needed */}
      <main className="flex-1 min-h-0 relative z-10 flex flex-col items-center justify-start w-full">
        {children}
      </main>
    </div>
  );
}

