// components/full-page-loader.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function FullPageLoader() {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="w-full max-w-3xl px-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-[200px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
          
          {/* Content Area */}
          <div className="space-y-6">
            <Skeleton className="h-64 w-full rounded-lg" />
            
            {/* Simulated cards */}
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-[300px]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
              </div>
            ))}
          </div>
          
          {/* Footer */}
          <div className="flex justify-end gap-4 pt-8">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}