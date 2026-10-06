export default function V2OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {children}
    </div>
  );
}
