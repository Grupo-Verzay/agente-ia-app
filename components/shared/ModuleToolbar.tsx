"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModuleToolbarProps = {
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function ModuleToolbar({ children, left, right, className }: ModuleToolbarProps) {
  const content = children ?? (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      <div className="flex items-center gap-2 sm:shrink-0">{right}</div>
    </>
  );

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      {content}
    </div>
  );
}
