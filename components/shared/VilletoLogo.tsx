import Image from "next/image";
import { cn } from "@/lib/utils";

interface VilletoLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function VilletoLogo({
  className,
  size: _size = "md",
  showText: _showText = true,
}: VilletoLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Villeto "V" checkmark logo */}
      <Image src="/images/logo.png" width={128} height={56} className='h-14 w-32 object-cover' alt="Villeto" />
    </div>
  );
}
