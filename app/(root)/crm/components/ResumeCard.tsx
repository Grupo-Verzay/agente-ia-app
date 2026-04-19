export const ResumeCard = ({ label, value }: { label: string; value: number }) => {
    return (
        <div className="rounded-md border bg-background px-3 py-2 flex flex-col gap-0.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold">{value}</span>
        </div>
    );
}
