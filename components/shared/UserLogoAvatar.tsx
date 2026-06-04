"use client";

import type { Plan } from "@prisma/client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PlanBadgeDisplay } from "@/components/shared/PlanBadgeDisplay";

type UserLogoAvatarProps = {
  logoUrl?: string | null;
  plan?: Plan | string | null;
  alt?: string;
  className?: string;
};

export function UserLogoAvatar({ logoUrl, plan, alt, className }: UserLogoAvatarProps) {
  return (
    <Avatar className={cn("h-10 w-10 shrink-0 rounded-full border bg-background", className)}>
      {logoUrl && <AvatarImage src={logoUrl} alt={alt ?? "Logo"} className="object-cover" />}
      <AvatarFallback className="rounded-full bg-transparent p-0">
        <PlanBadgeDisplay plan={plan} iconClassName="h-10 w-10 rounded-full" />
      </AvatarFallback>
    </Avatar>
  );
}
