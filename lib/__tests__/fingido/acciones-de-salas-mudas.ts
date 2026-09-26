/**
 * Las acciones de las salas de video, mudas.
 *
 * El diálogo de `AbrirReunion` pide sus salas AL ABRIRSE, así que el banco
 * necesita que esa consulta conteste algo: lo que se comprueba es que el mando
 * de la reunión abre el diálogo —y que no despacha ninguna llamada—, no lo que
 * el diálogo trae dentro.
 *
 * Están TODAS y no solo las dos que hacen falta: `AbrirReunion` arrastra la sala
 * entera por sus hooks, y en ESM una que falte no es un `undefined` al llamarla
 * —es un paquete que no compila—.
 */

/**
 * La lista de salas del canal: vacía, que es lo que el diálogo sabe pintar.
 *
 * `salas` y no `data`: el diálogo lee `res.salas` y hace `salas.length`, así que
 * con la llave equivocada revienta al abrirse y el banco dice «no se abrió el
 * diálogo» sin que la cabecera tenga nada que ver.
 */
export async function lasSalasDelCanalAction() {
    return { success: true as const, salas: [] };
}

const noSeLlama = async () => ({ success: false as const, message: "el banco no habla con las salas" });

export const cambiarLaCaducidadAction = noSeLlama;
export const comoEntroAction = noSeLlama;
export const crearLaReunionDeLaCuentaAction = noSeLlama;
export const crearLaSalaAction = noSeLlama;
export const dejarPasarAction = noSeLlama;
export const elHistorialDeReunionesAction = noSeLlama;
export const empezarAGrabarAction = noSeLlama;
export const enviarSenalAction = noSeLlama;
export const escribirEnLaReunionAction = noSeLlama;
export const lasGrabacionesDeLasReunionesAction = noSeLlama;
export const lasReunionesDeLaCuentaAction = noSeLlama;
export const latidoDeLaSalaAction = noSeLlama;
export const levantarLaManoAction = noSeLlama;
export const llamarALaPuertaAction = noSeLlama;
export const regenerarLaSalaAction = noSeLlama;
export const revocarLaSalaAction = noSeLlama;
export const sacarDeLaSalaAction = noSeLlama;
export const salirDeLaSalaAction = noSeLlama;
export const silenciarAAction = noSeLlama;
export const terminarDeGrabarAction = noSeLlama;
export const transcribirLaReunionAction = noSeLlama;
export const volverAEntrarAction = noSeLlama;
