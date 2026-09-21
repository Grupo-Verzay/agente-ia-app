/**
 * `CallDialog` de mentira para el banco del menú de llamada.
 *
 * El anfitrión de la llamada lo importa, y con él se vendría al paquete el
 * WebRTC entero —micrófono, `RTCPeerConnection`, relojes—. Nada de eso decide
 * lo que este banco prueba, que es **qué se dispara y con qué línea**; y
 * `abrirLlamadaAqui` sí es el de verdad, así que el evento que se escucha es el
 * que sale en producción.
 */
export function CallDialog() {
    return null;
}
