import { Skeleton } from "@/components/ui/skeleton";

export const SkeletonAutoReplies = () => {
    return (
        <div className="space-y-4 px-6 py-8">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-6 w-1/2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
            </div>
        </div>
    );
};
