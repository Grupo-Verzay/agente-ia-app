/**
 * Copiar al portapapeles con red: en un origen sin HTTPS o sin permiso
 * `navigator.clipboard` lanza, y un botón que falla callado es peor que no
 * tenerlo. Si no se puede, se intenta con una caja de texto temporal y, si
 * tampoco, se devuelve `false` para que la pantalla diga qué hacer.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch {
        // cae al respaldo
    }
    try {
        const caja = document.createElement("textarea");
        caja.value = texto;
        caja.setAttribute("readonly", "");
        caja.style.position = "fixed";
        caja.style.opacity = "0";
        document.body.appendChild(caja);
        caja.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(caja);
        return ok;
    } catch {
        return false;
    }
}
