import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export const ModuleCardSkeleton = () => {
    return (
        <>
            {
                [1, 2, 3, 4, 5, 6].map(s => (
                    <Card key={s} className="w-full max-w-md border-border">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded-full" />
                                <CardTitle>
                                    <Skeleton className="h-5 w-32" />
                                </CardTitle>
                            </div>
                            <Skeleton className="h-4 w-24 mt-2" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Skeleton className="h-5 w-24 rounded-md" />
                            <Skeleton className="h-5 w-20 rounded-md" />
                            <div className="flex gap-2 mt-2">
                                <Skeleton className="h-5 w-16 rounded-md" />
                                <Skeleton className="h-5 w-20 rounded-md" />
                            </div>
                            <div className="mt-4 space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-4 w-44" />
                            </div>
                        </CardContent>
                    </Card>
                ))
            }

        </>
    )
}
