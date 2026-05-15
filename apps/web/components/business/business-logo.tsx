"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

interface BusinessLogoProps {
  logoUrl?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
};

const iconSizeClass = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export default function BusinessLogo({
  logoUrl,
  name,
  size = "md",
  className = "",
}: BusinessLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl && !failed);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] ${sizeClass[size]} ${className}`}
      aria-label={name ? `Logo de ${name}` : "Logo del negocio"}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl ?? undefined}
          alt={name ? `Logo de ${name}` : "Logo del negocio"}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2
          className={`${iconSizeClass[size]} text-[#8891A4]`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
