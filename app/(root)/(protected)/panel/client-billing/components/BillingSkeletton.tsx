import { Skeleton } from "@/components/ui/skeleton"

export const BillingSkeletton = () => {
    return (

        <div className="space-y-3 py-2">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
            </div>
        </div>
    )
}

