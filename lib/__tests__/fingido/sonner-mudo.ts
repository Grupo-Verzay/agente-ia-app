/** `sonner` sin su `<Toaster>`: el banco no mide avisos, mide llamadas. */
function anotar(clase: string) {
    return (texto?: unknown) => {
        const w = globalThis as unknown as { __avisos?: { clase: string; texto: string }[] };
        (w.__avisos ??= []).push({ clase, texto: String(texto ?? "") });
    };
}
export const toast = Object.assign(anotar("info"), {
    success: anotar("success"),
    error: anotar("error"),
    warning: anotar("warning"),
    info: anotar("info"),
});
