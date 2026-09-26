/**
 * El doble de `@/actions/embudos-actions` para el banco de las filas de los
 * menús de la cabecera.
 *
 * Hace falta uno de verdad —y no el genérico de `empaquetar-con-acciones-mudas`,
 * que contesta `{ success: true, data: [] }`— porque el selector de Etapas pide
 * su lista al ABRIRLO: con una lista vacía el panel enseña «esta cuenta todavía
 * no tiene embudos» y no hay ninguna fila que medir, o sea que el banco pasaría
 * sin ejercer nada.
 *
 * Los nombres son de una palabra y de varias, y uno más largo que el panel, que
 * es lo que obliga al recorte y al globo.
 */

export const ETAPAS_DEL_BANCO = [
    { id: "s1", embudoId: "f1", nombre: "Nuevo", color: 1, orden: 0 },
    { id: "s2", embudoId: "f1", nombre: "Contactado", color: 2, orden: 1 },
    { id: "s3", embudoId: "f1", nombre: "Esperando respuesta del cliente", color: 3, orden: 2 },
];

/** La puesta es la segunda: ni la primera ni la última, para que el gris no
 *  pueda confundirse con un borde del panel. */
export const ETAPA_PUESTA = "s2";

export const etapaDeLaConversacionAction = async () => ({
    success: true,
    message: "",
    data: {
        embudoId: "f1",
        embudoNombre: "Ventas",
        etapas: ETAPAS_DEL_BANCO,
        etapaId: ETAPA_PUESTA,
        puedeMover: true,
    },
});

export const moverTarjetaAction = async () => ({ success: true, message: "Movida." });
