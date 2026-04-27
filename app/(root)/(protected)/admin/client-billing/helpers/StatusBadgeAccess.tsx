import { Badge } from "@/components/ui/badge";
import { AccessStatus } from "@/types/billing";

export function StatusBadgeAccess(status?: AccessStatus) {
    if (status === "ACTIVE") return <Badge className="bg-emerald-500 hover:bg-emerald-600">Activo</Badge>;
    return (
        <Badge variant="destructive">
            Inactivo
        </Badge>
    );
}
