'use client'

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const TemplateCardSkeleton = () => {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col justify-between border-border">
          <CardHeader>
            <Skeleton className="h-4 w-3/4 rounded" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-5/6 rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
            <div className="pt-2 space-y-1 text-xs">
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-8 w-full rounded-md" />
          </CardFooter>
        </Card>
      ))}
    </>
  )
}
