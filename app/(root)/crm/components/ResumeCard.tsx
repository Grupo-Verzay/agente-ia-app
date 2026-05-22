export const ResumeCard = ({
  label,
  value,
  onClick,
  accentClass,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  accentClass?: string;
}) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-md border bg-background px-3 py-2.5 flex items-center justify-between gap-2 w-full text-left shadow-sm${onClick ? " hover:bg-accent transition-colors cursor-pointer" : ""} ${accentClass ?? ""}`}
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`text-base font-bold ${value > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>{value}</span>
    </Tag>
  );
};
