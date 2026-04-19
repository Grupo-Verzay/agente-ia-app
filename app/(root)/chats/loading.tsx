import { Skeleton } from "@/components/ui/skeleton";

function SidebarSkeleton() {
  return (
    <div className="hidden h-full w-80 flex-shrink-0 border-r bg-background/70 p-4 md:flex md:w-96">
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>

        <Skeleton className="h-10 w-full rounded-xl" />

        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 rounded-xl" />
          ))}
        </div>

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-2xl border p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="pl-[52px] pt-2">
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 border-b bg-white p-3 dark:bg-gray-800">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex justify-center">
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>

        {Array.from({ length: 5 }).map((_, index) => {
          const isUser = index % 2 === 1;
          return (
            <div
              key={index}
              className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && <Skeleton className="h-7 w-7 rounded-full" />}
              <div className="space-y-2">
                <Skeleton className={`h-4 rounded-full ${isUser ? "w-28" : "w-36"}`} />
                <Skeleton className={`h-16 rounded-2xl ${isUser ? "w-56" : "w-64"}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t bg-gray-50 p-3 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex h-full overflow-hidden">
      <SidebarSkeleton />
      <ChatSkeleton />
    </div>
  );
}
