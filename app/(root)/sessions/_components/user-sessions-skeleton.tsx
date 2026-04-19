'use client';

import { Skeleton } from "@/components/ui/skeleton";

export function UserSessionsSkeleton() {
  return (
    <div className="space-y-4 mt-6">
      {[...Array(5)].map((_, idx) => (
        <div key={idx} className="flex items-center gap-6 p-4 border border-border rounded-md animate-pulse">
          <Skeleton className="h-6 w-[20%]" />
          <Skeleton className="h-6 w-[25%]" />
          <Skeleton className="h-6 w-[15%]" />
          <Skeleton className="h-6 w-[15%]" />
          <Skeleton className="h-6 w-[15%]" />
          <Skeleton className="h-6 w-[10%]" />
          <Skeleton className="h-6 w-[15%]" />
        </div>
      ))}
    </div>
  );
}
