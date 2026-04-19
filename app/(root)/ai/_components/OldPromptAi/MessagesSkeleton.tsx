import { Skeleton } from "@/components/ui/skeleton";

export const MessagesSkeleton = () => {
  return (
    <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-md" />
      ))}
    </div>
  );
}
