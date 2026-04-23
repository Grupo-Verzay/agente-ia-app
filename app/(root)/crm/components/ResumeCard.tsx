export const ResumeCard = ({ label, value }: { label: string; value: number }) => {
    return (
        <div className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-bold">{value}</span>
        </div>
    );
}
