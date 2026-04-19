export const SummaryItem = ({ label, value }: { label: string; value?: string | number | null }) => {
    return (
        <div className="text-sm">
            <div className="text-muted-foreground text-[12px]">{label}</div>
            <div className="font-medium">{value ?? "—"}</div>
        </div>
    );
}