import { Skeleton } from "@/components/ui/skeleton";

export const ReminderSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  )
};

export const CreateReminderSkeleton = () => {
  return (
    <div className="flex flex-col overflow-hidden gap-4 p-2">
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-full rounded-md" /> {/* título */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-24 w-full rounded-md" /> {/* descripción */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-1/2 rounded-md" /> {/* fecha */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-1/2 rounded-md" /> {/* repetición */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-2/3 rounded-md" /> {/* lead */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-2/3 rounded-md" /> {/* workflow */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-2/3 rounded-md" /> {/* workflow */}
      <Skeleton className="bg-muted/50 dark:bg-muted/30 h-10 w-full rounded-md" /> {/* botón */}
    </div>
  )
};
