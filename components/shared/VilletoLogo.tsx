import { cn } from "@/lib/utils";

interface VilletoLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function VilletoLogo({
  className,
  size = "md",
  showText = true,
}: VilletoLogoProps) {
  const sizes = {
    sm: { icon: 20, text: "text-base" },
    md: { icon: 26, text: "text-xl" },
    lg: { icon: 36, text: "text-2xl" },
  };
  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Villeto "V" checkmark logo */}
      <img src="/images/logo.png" className='h-14 w-32 object-cover' alt="Villeto" />
    </div>
  );
}
