
export function formatFecha(fecha: Date | string) {
    if (!fecha || fecha === "") return "-";
    try {
        return new Date(fecha).toLocaleString("es-CO", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return String(fecha);
    }
}