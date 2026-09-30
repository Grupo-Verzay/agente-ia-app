// Las tarjetas de la ventana de tutoriales: las pone el test en
// `window.__tutoriales` (una de YouTube, una guía de /guia y una sin texto).
export async function getGuidesForPath() {
    return (window as any).__tutoriales ?? [];
}
