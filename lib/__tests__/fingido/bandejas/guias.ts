// Las guías de la barra: con `window.__conGuias` sale el botón rojo de
// tutoriales, que es el que más ancho le quita a la derecha de la barra.
export async function getGuidesForPath() {
    return (window as any).__conGuias
        ? [{ id: "g1", title: "Guía", description: "", url: "https://x", path: "/chats" }]
        : [];
}
