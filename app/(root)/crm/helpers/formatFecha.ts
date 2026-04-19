
export function formatFecha(fecha: Date | string) {
    if (!fecha || fecha === "") return "-";
    try {
        return fecha.toLocaleString("es-CO", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return String(fecha);
    }
}