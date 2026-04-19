import { Loader2 } from "lucide-react";

export const LoadingState = ({ label }: { label: string }) => {
    return (
        <div className="flex min-h-[280px] items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {label}
            </div>
        </div>
    );
}