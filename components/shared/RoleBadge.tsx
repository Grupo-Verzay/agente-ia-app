"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getEffectiveRoleLabel,
  getRoleScopeLabel,
  isAdvisorAccount,
  isAdvisorAdmin,
  type PermissionSubject,
} from "@/lib/permissions";

type Props = {
  user?: PermissionSubject | null;
  compact?: boolean;
  className?: string;
};

export function RoleBadge({ user, compact = false, className }: Props) {
  const label = getEffectiveRoleLabel(user);
  const scope = getRoleScopeLabel(user);
  const isLinked = isAdvisorAccount(user);
  const isLinkedAdmin = isAdvisorAdmin(user);

  const colorClass = isLinked
    ? isLinkedAdmin
      ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"
      : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
    : user?.role === "super_admin"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      : user?.role === "admin"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        : user?.role === "reseller"
          ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";

  return (
    <Badge
      variant="outline"
      title={scope}
      className={cn(
        "max-w-full justify-center truncate rounded-md border px-1.5 py-0 text-[10px] font-medium",
        colorClass,
        className,
      )}
    >
      {compact ? label : `${label} - ${scope}`}
    </Badge>
  );
}
