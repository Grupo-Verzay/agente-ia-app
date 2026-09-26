/**
 * Qué se le puede hacer a alguien dentro de una reunión, y qué no.
 *
 * Puro a propósito, y por un motivo que ya costó una vuelta en otras pantallas
 * de este repositorio: **los mandos se ofrecen desde DOS sitios** —el recuadro
 * de la persona y la lista de gente del panel— y los dos tienen que decir
 * exactamente lo mismo. Con la condición escrita en cada uno, el día que se
 * afine una el otro se queda atrás, y eso no se ve como un error: se ve como
 * que «desde el recuadro a veces no deja».
 *
 * # Y tiene que decir lo mismo que el SERVIDOR
 *
 * Es la mitad que de verdad importa. `silenciarAAction` y `sacarDeLaSalaAction`
 * rechazan tres cosas —no moderar, hacérselo a uno mismo, y hacérselo a quien
 * ya no está dentro— y esta función ofrece exactamente esas tres y ninguna
 * más. Si ofreciera de más saldría un botón que al pulsarlo da error; si
 * ofreciera de menos, una puerta abierta sin menú que lleve a ella. El banco
 * las **encadena**: elige un mando de aquí y comprueba que la acción no lo
 * rechaza.
 *
 * Lo que NO se decide aquí es quién modera: eso lo contesta el servidor
 * (`puedeAdministrarLaSala`) y baja en `moderas`. Ver `lib/sala-de-video.ts`.
 */

/** Un mando: si se ofrece, y —cuando no— por qué. */
export type MandoDeModeracion = {
    /** Si se puede pulsar. */
    puede: boolean;
    /**
     * Qué dice al posarse encima, se pueda o no.
     *
     * **Nunca vacío, ni siquiera apagado.** Un botón gris sin explicación se
     * lee como que la App está rota, no como que ya tiene el micro apagado.
     */
    porQue: string;
};

export type MandosDeModeracion = {
    /**
     * Si se pinta el menú.
     *
     * Con esto en `false` no se pinta **nada** —ni un menú vacío, ni tres
     * puntos apagados—: un menú que se abre sin nada dentro se lee como un
     * fallo, y encima le dice a quien no modera que aquí hay mandos que no
     * tiene. Eso lo explica la lista de gente en una línea, que es donde hay
     * sitio para explicarlo.
     */
    hayMenu: boolean;
    silenciar: MandoDeModeracion;
    sacar: MandoDeModeracion;
};

export function losMandosDeModeracion(input: {
    /** Si puedo silenciar y sacar. Lo dice el servidor. */
    moderas: boolean;
    /** Si esta persona soy yo. */
    soyYo: boolean;
    /** Si esta persona tiene el micrófono encendido. */
    micEncendido: boolean;
    /**
     * Si esta persona está DENTRO de la reunión.
     *
     * Por omisión sí: los dos sitios que pintan estos mandos solo listan a los
     * que están dentro. Está en la firma porque el servidor sí lo comprueba, y
     * una condición que el servidor mira y la pantalla no es la que deja un
     * botón ofreciendo algo que luego se cae.
     */
    estaDentro?: boolean;
    /** Cómo se llama, para poder decirlo en el rótulo. */
    nombre: string;
}): MandosDeModeracion {
    const { moderas, soyYo, micEncendido, nombre } = input;
    const estaDentro = input.estaDentro ?? true;

    // Sobre uno mismo no se pinta ningún mando, y no es lo mismo que no poder:
    // callarse tiene su propio botón —y ese sí apaga la pista de verdad, en vez
    // de dejarse una orden a uno mismo— y sacarse a uno mismo es colgar.
    const hayMenu = moderas && !soyYo && estaDentro;

    return {
        hayMenu,
        silenciar: {
            // El servidor solo marca la fila si esa persona sigue dentro; el
            // micro apagado no lo rechaza, pero pedirle silencio a quien ya
            // está callado es un botón que no hace nada.
            puede: hayMenu && micEncendido,
            porQue: micEncendido
                ? `Pedirle a ${nombre} que silencie su micrófono`
                : "Ya tiene el micrófono apagado",
        },
        sacar: {
            puede: hayMenu,
            porQue: `Sacar a ${nombre} de la reunión`,
        },
    };
}
