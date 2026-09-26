/**
 * Las tres acciones de la nota rápida, **anotando lo que se les pide**.
 *
 * El empaquetador de acciones mudas contesta `{ success: true, data: [] }` a
 * todo, y con eso no se puede afirmar lo único que importa de esta pantalla:
 * **que se guarda sola**. Cuántas veces se llamó y con qué texto es justo el
 * dato que hay que mirar —un guardado por tecla sería una petición por letra, y
 * ninguno sería lo apuntado perdido—.
 *
 * Guarda además lo último escrito, para que reabrir el panel traiga lo de
 * antes: sin eso, el papel volvería vacío y no se podría distinguir «no se
 * guardó» de «no se leyó».
 */
type Llamada = { que: "leer" | "guardar" | "mandar"; texto?: unknown };

function apuntar(llamada: Llamada) {
    const w = globalThis as unknown as { __nota?: Llamada[] };
    (w.__nota ??= []).push(llamada);
}

function papel(): { texto: string } {
    const w = globalThis as unknown as { __papel?: { texto: string } };
    return (w.__papel ??= { texto: "" });
}

export async function leerMiNotaRapidaAction() {
    apuntar({ que: "leer" });
    return { success: true, texto: papel().texto };
}

export async function guardarMiNotaRapidaAction(texto: unknown) {
    apuntar({ que: "guardar", texto });
    papel().texto = typeof texto === "string" ? texto : "";
    return { success: true, texto: papel().texto };
}

export async function mandarLaNotaAlModuloAction(texto: unknown) {
    apuntar({ que: "mandar", texto });
    papel().texto = "";
    return { success: true, titulo: "Lo apuntado", noteId: "nota-1" };
}
