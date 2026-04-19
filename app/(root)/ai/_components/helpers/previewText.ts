export const previewText = (text: string | undefined, max = 80) => {
    const t = (text ?? "").replace(/\r\n|\r/g, "\n").trim();
    if (!t) return "(sin respuesta)";
    return t.length > max ? t.slice(0, max) + "…" : t;
};
