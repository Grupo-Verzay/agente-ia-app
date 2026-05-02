export const ResumeCard = ({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) => {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 w-full text-left${onClick ? " hover:bg-accent transition-colors cursor-pointer" : ""}`}
        >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-bold">{value}</span>
        </Tag>
    );
}
