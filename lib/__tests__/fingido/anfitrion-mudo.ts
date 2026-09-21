/**
 * El anfitrión de la llamada, MUDO, para los bancos que pintan en Chromium.
 *
 * El de verdad monta `CallDialog`, y eso arrastra WebRTC, el micrófono y los
 * relojes que vigilan una llamada: nada de eso tiene que existir para medir una
 * barra de mandos. Lo único que se conserva es **`abrirLlamadaAqui` de verdad**
 * —el mismo `CustomEvent("llamada:abrir")`—, porque es el canal por el que un
 * botón dice a quién llamar y es justo lo que un banco quiere poder afirmar.
 *
 * Copiar aquí un `abrirLlamadaAqui` que no despache nada sería un doble que
 * deja verde a cualquier cosa: el banco mediría que el botón se pulsa, no que
 * la llamada sale.
 */
export interface DatosDeLaLlamada {
    phone: string;
    contactName?: string;
    instanceType?: string;
    instanceName?: string;
}

export function abrirLlamadaAqui(datos: DatosDeLaLlamada): void {
    window.dispatchEvent(new CustomEvent("llamada:abrir", { detail: datos }));
}

/** No pinta nada: en el banco no hay ninguna llamada que sostener. */
export function AnfitrionDeLlamada() {
    return null;
}
