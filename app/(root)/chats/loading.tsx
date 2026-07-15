import { Skeleton } from "@/components/ui/skeleton";
import { CachedSidebar } from "./_components/CachedSidebar";

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
      <CachedSidebar />
      <ChatSkeleton />
    </div>
  );
}
