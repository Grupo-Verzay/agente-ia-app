import type { LucideIcon } from "lucide-react";

type ChatEmptyStateProps = {
  Icon: LucideIcon;
  message: string;
};

export function ChatEmptyState({ Icon, message }: ChatEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <div className="rounded-2xl border p-6 opacity-70">
        <Icon className="h-8 w-8" />
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
