import { Badge } from "@/components/ui/badge";
import { AccessStatus } from "@/types/billing";

export function StatusBadgeAccess(status?: AccessStatus) {
    if (status === "ACTIVE") return <Badge>Activo</Badge>;
    return (
        <Badge variant="destructive">
            Inactivo
        </Badge>
    );
}
