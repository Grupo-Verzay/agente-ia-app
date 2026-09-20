"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { comoConsultaDeBusqueda } from "@/lib/busqueda-del-equipo";
import {
    TOPE_DE_FILAS,
    TOPE_DE_RESULTADOS,
    comoEstados,
    comoId,
    comoTipoDeDocumento,
    comoTipoDeMencion,
    comoTitulo,
    comoVista,
    conLosFijadosArriba,
    documentoVacio,
    extractoConLoBuscado,
    type Compartible,
    type FilaDeLista,
    type Mencion,
    type TipoDeDocumento,
    type TipoDeMencion,
    type Vista,
} from "@/lib/documentacion";
import {
    comoPermiso,
    comoSujeto,
    comoVisibilidad,
    laCuentaDeQuienMira,
    puedeMandarEnElEspacio,
    type Acceso,
    type Permiso,
    type SujetoDePermiso,
    type VisibilidadDeEspacio,
} from "@/lib/documentacion-permisos";
import {
    accesoAEsteDocumento,
    accesoAEsteEspacio,
    losEspaciosQueAlcanza,
    losQueAlcanzaDeEstos,
} from "@/lib/acceso-al-documento";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import {
    LoCambioOtro,
    archivarDocumento,
    borrarDocumento,
    borrarEspacio,
    borrarFila,
    crearDocumento,
    crearEspacio,
    crearFila,
    cuantasFilasTiene,
    cuantosDocumentosTiene,
    editarEspacio,
    editarFila,
    fijarDocumento,
    guardarDocumento,
    laFila,
    lasFilasDe,
    lasVersionesDe,
    laVersion,
    loQueNombra,
    losDocumentosDe,
    losPermisosDe,
    losQueNombran,
    ponerPermiso,
    quitarPermiso,
    reemplazarLasCuentas,
    buscarDocumentos,
    type DocumentoEnLista,
    type Espacio,
    type Version,
} from "@/lib/documentacion-db";
import {
    alFinalDelTablero,
    olvidarLaTarjeta,
    posicionesDelTablero,
} from "@/lib/orden-de-tablero-db";
import { ordenarLaColumna } from "@/lib/orden-del-tablero";

/**
 * Las acciones de Documentación.
 *
 * **La puerta está aquí, no en la pantalla.** `/documentos` entra en
 * `navigationRoutes` y **no se monta en ningún módulo**: se asigna a mano. El
 * guardián del layout solo cierra rutas que sí están en algún módulo y
 * denegadas, así que una que no está en ninguno se alcanza escribiendo la URL.
 * Por eso cada acción resuelve el acceso con `acceso-al-documento` y la página
 * solo pinta lo que le devuelvan. Es lo mismo que ya rige en `/cobros`.
 *
 * ## Firmar con la persona, alcanzar con la cuenta
 *
 * Es lo que el encargo pedía y lo que el resto de la plataforma ya hace:
 *
 * - **Firmar** — `creadoPorId`, `actualizadoPorId` y el autor de cada versión
 *   salen de `laPersonaQueActua(user)`. Dentro de una cuenta ajena con
 *   «Ingresar», quien escribe es la persona sentada delante, no el cliente.
 * - **Alcanzar** — a qué espacios se llega sale de la fila EFECTIVA
 *   (`laCuentaDeQuienMira`). Resolver la persona aquí es lo que rompió la
 *   cartera de clientes en el #783.
 *
 * ## Y por eso esto se puede ofrecer como módulo a una cuenta cliente
 *
 * No hay ni un id de Verzay en todo el módulo. Cada espacio cuelga de su
 * `cuentaId`, y una cuenta cliente que reciba la pestaña ve la suya y nada más.
 */

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

const NO = (message: string) => ({ success: false as const, message });

/** Quien mira, con lo que hace falta para decidir alcance y firma. */
async function quienLlama() {
    const user = await currentUser();
    if (!user?.id) return null;
    const persona = laPersonaQueActua(user);
    return {
        user,
        cuenta: laCuentaDeQuienMira(user),
        personaId: persona.id,
        personaNombre: persona.nombre,
    };
}

/* ────────────────────────────── Los espacios ────────────────────────────── */

export type ArbolDeDocumentacion = {
    espacios: Array<{
        espacio: Espacio;
        puedeEditar: boolean;
        puedeGestionar: boolean;
        /**
         * Renombrar y borrar ESTE espacio. Es una pregunta aparte de
         * `puedeGestionar` —ver `puedeMandarEnElEspacio`—: aquella decide
         * además crear documentos dentro y repartir permisos.
         */
        puedeMandar: boolean;
        recibido: boolean;
        documentos: DocumentoEnLista[];
    }>;
    /** Las plantillas que alcanza, aparte: se copian, no se leen. */
    plantillas: DocumentoEnLista[];
    puedeCrearEspacio: boolean;
    /**
     * Si quien mira puede colocar los espacios de SU árbol.
     *
     * Es la misma respuesta que da `guardarElOrdenDeLaColumnaAction` para el
     * tipo `arbol`, y viaja aquí para que la pantalla no pinte un asa que al
     * usarse contesta «no autorizado» — el «menú abierto, puerta cerrada» que
     * este repositorio ya ha pagado cinco veces. La puerta sigue estando en la
     * acción: esconder el asa evita el arrastre accidental, no la petición.
     */
    puedeOrdenarElArbol: boolean;
};

export async function leerElArbolAction(input?: {
    verArchivados?: unknown;
}): Promise<ArbolDeDocumentacion | null> {
    const quien = await quienLlama();
    if (!quien) return null;

    const verArchivados = input?.verArchivados === true;
    // Un agente participa, no coloca: el orden del árbol es de la CUENTA y lo
    // ve su equipo entero. Misma mitad que `puedeMandarEnElEspacio`.
    const puedeOrdenarElArbol = quien.user.advisorRole !== "agente";

    const { espacios, contenedores, permisos } = await losEspaciosQueAlcanza(quien.user);
    const conYSin = [...espacios, ...contenedores];
    if (conYSin.length === 0) {
        return { espacios: [], plantillas: [], puedeCrearEspacio: true, puedeOrdenarElArbol };
    }

    // **El mapa de decidir lleva SOLO los espacios que se alcanzan de verdad.**
    // Los `contenedores` entran en la lista de la izquierda para que el
    // documento compartido tenga dónde salir, pero no pueden entrar aquí: con
    // ellos dentro, `accesoAlDocumento` daría por bueno todo el espacio.
    const porId = new Map(espacios.map((e) => [e.espacio.id, e.espacio]));
    const todos = await losDocumentosDe(
        conYSin.map((e) => e.espacio.id),
        { incluirArchivados: verArchivados },
    );

    // **El mismo filtro que abrir.** Un documento restringido desaparece
    // también de aquí: ver la regla en `documentacion-permisos.ts`.
    const visibles = losQueAlcanzaDeEstos(quien.user, todos, porId, permisos);

    const plantillas = visibles.filter((d) => d.tipo === "plantilla");
    const normales = visibles.filter((d) => d.tipo !== "plantilla");

    // **El orden puesto a mano, de una consulta por espacio y en paralelo.** Lo
    // que nadie haya arrastrado nunca no tiene ni una fila aquí, así que sale
    // exactamente como lo devolvió la base —por `creadoEn`, del más viejo al
    // más nuevo— y esto no cambió ningún árbol hasta el primer arrastre.
    const colocados = await Promise.all(
        conYSin.map(({ espacio }) => posicionesDelTablero("espacio", espacio.id)),
    );
    // Por id y no por índice: debajo los espacios se reordenan, y buscar la
    // posición por el sitio que ocupaba antes daría el orden de OTRO espacio.
    const porEspacio = new Map(conYSin.map((e, i) => [e.espacio.id, colocados[i] ?? {}]));

    // Y el orden de los ESPACIOS, que es del árbol de esta cuenta y no de cada
    // espacio: una consulta, con `tableroId` = la cuenta. Sin ninguna fila
    // —nadie ha arrastrado nunca— `ordenarLaColumna` devuelve la lista tal cual
    // la trajo la base, o sea por `orden ASC, nombre ASC` como siempre.
    const arbolColocado = await posicionesDelTablero("arbol", quien.cuenta);
    const enOrden = ordenarLaColumna(conYSin, arbolColocado, (e) => e.espacio.id);

    return {
        espacios: enOrden.map(({ espacio, acceso }) => ({
            espacio,
            puedeEditar: acceso.puedeEditar,
            puedeGestionar: acceso.puedeGestionar,
            puedeMandar: puedeMandarEnElEspacio(quien.user, espacio, acceso),
            recibido: acceso.recibido,
            // Los fijados por encima del orden puesto a mano: fijar no es una
            // posición, es una banda. Ver `conLosFijadosArriba`.
            documentos: conLosFijadosArriba(
                ordenarLaColumna(
                    normales.filter((d) => d.espacioId === espacio.id),
                    porEspacio.get(espacio.id) ?? {},
                    (d) => d.id,
                ),
            ),
        })),
        plantillas,
        puedeCrearEspacio: true,
        puedeOrdenarElArbol,
    };
}

/**
 * Cuántos documentos se va a llevar borrar un espacio.
 *
 * Es su propia acción —y no un número que ya viaje en el árbol— porque el árbol
 * trae **lo que quien mira alcanza**, sin los restringidos de otra gente, y el
 * borrado se lleva el espacio entero. Enseñar en la confirmación un número más
 * pequeño que el que se va a borrar es peor que no enseñar ninguno.
 *
 * Misma puerta que borrar, y va por `accesoAEsteEspacio`: si no, contar los
 * documentos de un espacio ajeno sería una forma de preguntar cuánto tiene
 * dentro.
 */
export async function cuantosDocumentosTieneAction(input: {
    id: unknown;
}): Promise<Respuesta<{ cuantos: number }>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el espacio.");

    const acceso = await accesoAEsteEspacio(quien.user, id);
    if (!acceso) return NO("No autorizado.");
    if (!puedeMandarEnElEspacio(quien.user, acceso.espacio, acceso.acceso)) {
        return NO("No autorizado.");
    }

    try {
        return { success: true, data: { cuantos: await cuantosDocumentosTiene(id) } };
    } catch (error) {
        console.warn("[documentacion] no se pudo contar los documentos del espacio", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo contar los documentos del espacio.");
    }
}

export async function crearEspacioAction(input: {
    nombre: unknown;
    icono?: unknown;
    descripcion?: unknown;
    visibilidad?: unknown;
}): Promise<Respuesta<Espacio>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const nombre = comoTitulo(input.nombre);
    if (!nombre) return NO("El espacio necesita un nombre.");

    try {
        const espacio = await crearEspacio({
            // **La cuenta, no la persona**: el espacio es de la cuenta y lo ve
            // su equipo.
            cuentaId: quien.cuenta,
            nombre,
            icono: typeof input.icono === "string" ? input.icono.slice(0, 32) : null,
            descripcion:
                typeof input.descripcion === "string" ? input.descripcion.slice(0, 500) : null,
            visibilidad: comoVisibilidad(input.visibilidad) ?? "cuenta",
            // **La persona, no la cuenta**: quién lo creó tiene que sobrevivir
            // a que se cambie de cuenta.
            creadoPorId: quien.personaId,
            creadoPorNombre: quien.personaNombre,
        });
        revalidatePath("/documentos");
        return { success: true, data: espacio };
    } catch (error) {
        console.warn("[documentacion] no se pudo crear el espacio", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo crear el espacio.");
    }
}

export async function editarEspacioAction(input: {
    id: unknown;
    nombre?: unknown;
    icono?: unknown;
    descripcion?: unknown;
    visibilidad?: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el espacio.");

    const acceso = await accesoAEsteEspacio(quien.user, id);
    if (!acceso) return NO("No autorizado.");
    // La puerta de CAMBIAR el espacio, que no es la de escribir dentro: ver
    // `puedeMandarEnElEspacio`. Pasan quien lo creó y quien administra la
    // cuenta; un `agente` y una cuenta invitada, nunca.
    if (!puedeMandarEnElEspacio(quien.user, acceso.espacio, acceso.acceso)) {
        return NO(
            acceso.acceso.recibido
                ? "Este espacio es de otra cuenta: solo puede cambiarlo su dueña."
                : "Solo quien creó el espacio o quien administra la cuenta puede cambiarlo.",
        );
    }

    const nombre = input.nombre === undefined ? undefined : comoTitulo(input.nombre);
    if (input.nombre !== undefined && !nombre) return NO("El espacio necesita un nombre.");

    try {
        await editarEspacio({
            id,
            // La guarda de arriba ya descarto el `null`; TS no lo estrecha solo
            // porque la condicion mira `input.nombre` y no esta variable.
            nombre: nombre ?? undefined,
            icono:
                input.icono === undefined
                    ? undefined
                    : typeof input.icono === "string"
                      ? input.icono.slice(0, 32)
                      : null,
            descripcion:
                input.descripcion === undefined
                    ? undefined
                    : typeof input.descripcion === "string"
                      ? input.descripcion.slice(0, 500)
                      : null,
            visibilidad:
                input.visibilidad === undefined
                    ? undefined
                    : (comoVisibilidad(input.visibilidad) ?? undefined),
        });
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo editar el espacio", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo guardar el espacio.");
    }
}

export async function borrarEspacioAction(input: { id: unknown }): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el espacio.");

    const acceso = await accesoAEsteEspacio(quien.user, id);
    if (!acceso) return NO("No autorizado.");
    // En uno RECIBIDO no manda nadie de esta cuenta: repartirlo sigue siendo de
    // quien lo hizo. Va aparte del resto de la condición porque el motivo es
    // otro y el aviso tiene que explicarlo.
    if (acceso.acceso.recibido) {
        return NO("Este espacio es de otra cuenta: solo puede borrarlo su dueña.");
    }
    if (!puedeMandarEnElEspacio(quien.user, acceso.espacio, acceso.acceso)) {
        return NO("Solo quien creó el espacio o quien administra la cuenta puede borrarlo.");
    }

    try {
        // **Suave**: sella `borradoEn` y no borra ni una fila. El espacio y sus
        // documentos dejan de alcanzarse por todas partes, y quitar el sello en
        // la base los devuelve enteros. Ver `borrarEspacio`.
        await borrarEspacio(id);
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo borrar el espacio", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo borrar el espacio.");
    }
}

/* ───────────────────────────── Los documentos ───────────────────────────── */

export type DocumentoAbierto = {
    id: string;
    espacioId: string;
    cuentaId: string;
    tipo: TipoDeDocumento;
    titulo: string;
    contenido: unknown;
    estados: string[];
    vista: Vista | null;
    restringido: boolean;
    fijado: boolean;
    archivadoEn: Date | null;
    version: number;
    actualizadoPorNombre: string | null;
    actualizadoEn: Date;
    puedeEditar: boolean;
    puedeGestionar: boolean;
    recibido: boolean;
    /** Lo que este documento nombra. */
    menciones: Mencion[];
    /** Las filas, si es una lista. */
    filas: FilaDeLista[];
    /**
     * Dónde está colocada cada fila dentro de su columna, del tablero
     * compartido. Lo que no esté aquí no se ha movido nunca y sale como salía.
     */
    posiciones: Record<string, number>;
};

export async function abrirDocumentoAction(input: {
    id: unknown;
}): Promise<Respuesta<DocumentoAbierto>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    // «No lo alcanzas» y «no existe» se contestan igual: decir «no puedes» ya
    // revela que existe y de quién es.
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");

    const { documento, acceso } = encontrado;
    const esLista = documento.tipo === "lista";
    const [menciones, filas, posiciones] = await Promise.all([
        loQueNombra(documento.id),
        esLista ? lasFilasDe(documento.id) : Promise.resolve([]),
        esLista
            ? posicionesDelTablero("documentacion", documento.id)
            : Promise.resolve({} as Record<string, number>),
    ]);

    return {
        success: true,
        data: {
            id: documento.id,
            espacioId: documento.espacioId,
            cuentaId: documento.cuentaId,
            tipo: documento.tipo,
            titulo: documento.titulo,
            contenido: documento.contenido,
            estados: documento.estados,
            vista: documento.vista,
            restringido: documento.restringido,
            fijado: documento.fijado,
            archivadoEn: documento.archivadoEn,
            version: documento.version,
            actualizadoPorNombre: documento.actualizadoPorNombre,
            actualizadoEn: documento.actualizadoEn,
            puedeEditar: acceso.puedeEditar,
            puedeGestionar: acceso.puedeGestionar,
            recibido: acceso.recibido,
            menciones,
            filas,
            posiciones,
        },
    };
}

export async function crearDocumentoAction(input: {
    espacioId: unknown;
    titulo: unknown;
    tipo?: unknown;
    /** El id de una plantilla de la que copiar el cuerpo. */
    desdePlantilla?: unknown;
}): Promise<Respuesta<{ id: string }>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const espacioId = comoId(input.espacioId);
    if (!espacioId) return NO("Falta el espacio.");

    const acceso = await accesoAEsteEspacio(quien.user, espacioId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeEditar) return NO("No puedes escribir en este espacio.");

    const titulo = comoTitulo(input.titulo);
    if (!titulo) return NO("El documento necesita un título.");

    const tipo = comoTipoDeDocumento(input.tipo) ?? "documento";

    // La plantilla se COPIA, y se comprueba que se alcance: sin eso, pasar el
    // id de una plantilla ajena sería la forma de leer su contenido entero.
    let contenido: unknown = documentoVacio();
    let estados: string[] | undefined;
    const plantillaId = comoId(input.desdePlantilla);
    if (plantillaId) {
        const plantilla = await accesoAEsteDocumento(quien.user, plantillaId);
        if (!plantilla) return NO("Esa plantilla no existe o no tienes acceso.");
        contenido = plantilla.documento.contenido;
        estados = plantilla.documento.estados;
    }

    try {
        const documento = await crearDocumento({
            // **La cuenta DUEÑA del espacio**, no la de quien escribe. Es la
            // misma regla que en Proyectos compartidos: un espacio, un juego de
            // documentos. Guardándolo bajo la cuenta invitada se quedaría fuera
            // de los dos árboles.
            cuentaId: acceso.acceso.cuentaId,
            espacioId,
            tipo,
            titulo,
            contenido,
            estados,
            vista: tipo === "lista" ? "tabla" : null,
            creadoPorId: quien.personaId,
            creadoPorNombre: quien.personaNombre,
        });
        // **Al final del espacio, no al principio.** Era el encargo, y sale
        // solo: el que trae posición cae detrás de los que no la tienen. Nunca
        // lanza —un documento creado es un documento creado— pero tampoco es
        // mudo.
        await alFinalDelTablero("espacio", espacioId, documento.id);
        revalidatePath("/documentos");
        return { success: true, data: { id: documento.id } };
    } catch (error) {
        console.warn("[documentacion] no se pudo crear el documento", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo crear el documento.");
    }
}

export async function guardarDocumentoAction(input: {
    id: unknown;
    titulo: unknown;
    contenido: unknown;
    estados?: unknown;
    vista?: unknown;
    versionQueSeVio?: unknown;
}): Promise<
    Respuesta<{ version: number; huboCambio: boolean; textoRecortado: boolean }> & {
        loCambioOtro?: boolean;
    }
> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes editar este documento.");

    const titulo = comoTitulo(input.titulo);
    if (!titulo) return NO("El documento necesita un título.");

    try {
        const resultado = await guardarDocumento({
            id,
            titulo,
            contenido: input.contenido,
            estados: input.estados === undefined ? undefined : comoEstados(input.estados),
            vista: input.vista === undefined ? undefined : comoVista(input.vista),
            versionQueSeVio:
                typeof input.versionQueSeVio === "number" ? input.versionQueSeVio : undefined,
            // **La PERSONA firma el cambio.** Dentro de una cuenta ajena con
            // «Ingresar», el historial tiene que decir quién estaba sentado
            // delante y no el nombre del cliente.
            autorId: quien.personaId,
            autorNombre: quien.personaNombre,
        });
        revalidatePath("/documentos");
        return { success: true, data: resultado };
    } catch (error) {
        // **Se distingue a proposito.** Un «no se pudo guardar» generico aqui
        // hace que la persona lo reintente, y reintentar es justo lo que pisa
        // el trabajo del otro.
        if (error instanceof LoCambioOtro) {
            return {
                ...NO(
                    "Alguien guardó este documento mientras lo editabas. Vuelve a abrirlo para no pisar su cambio.",
                ),
                loCambioOtro: true,
            };
        }
        console.warn("[documentacion] no se pudo guardar el documento", {
            documentoId: id,
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo guardar. Vuelve a intentarlo.");
    }
}

export async function borrarDocumentoAction(input: { id: unknown }): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeGestionar) return NO("No puedes borrar este documento.");

    try {
        await borrarDocumento(id);
        // Sin clave foránea la limpieza es explícita. Nunca lanza: no puede
        // reventar el borrado que la dispara.
        await olvidarLaTarjeta("espacio", encontrado.documento.espacioId, id);
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo borrar el documento", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo borrar el documento.");
    }
}

/**
 * Fijar un documento arriba de su espacio.
 *
 * La puerta es **`puedeEditar`**, no `puedeGestionar`: fijar es colocar, y
 * colocar es lo mismo que ya deja hacer arrastrar un documento dentro del
 * espacio. Pedir gestionar dejaría a quien tiene edición con el árbol a medias
 * —puede mover pero no fijar—, que no se lee como un permiso sino como que el
 * botón a veces no va.
 */
export async function fijarDocumentoAction(input: {
    id: unknown;
    fijado: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes fijar este documento.");

    try {
        await fijarDocumento(id, Boolean(input.fijado));
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo fijar el documento", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo fijar el documento.");
    }
}

/**
 * Archivar: fuera del árbol y de la búsqueda, **sin borrar nada**.
 *
 * La puerta es **`puedeGestionar`**, la misma que borrar, y a propósito: esto
 * lo esconde para TODO el equipo, no solo para quien lo pulsa. Con la puerta de
 * editar, cualquiera con permiso de escritura haría desaparecer del árbol la
 * documentación de sus compañeros, y desde fuera eso no se distingue de un
 * borrado. Es reversible, y por eso no es tan estricto como borrar de verdad.
 */
export async function archivarDocumentoAction(input: {
    id: unknown;
    archivado: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeGestionar) return NO("No puedes archivar este documento.");

    try {
        await archivarDocumento(id, Boolean(input.archivado));
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo archivar el documento", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo archivar el documento.");
    }
}

/** Cambiar quién alcanza un documento, y si está restringido. */
export async function restringirDocumentoAction(input: {
    id: unknown;
    restringido: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeGestionar) return NO("No puedes cambiar sus permisos.");

    try {
        const { db } = await import("@/lib/db");
        await db.$executeRaw`
            UPDATE "doc_documentos"
            SET "restringido" = ${Boolean(input.restringido)}, "actualizadoEn" = CURRENT_TIMESTAMP
            WHERE "id" = ${id}
        `;
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo cambiar el acceso", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo cambiar el acceso.");
    }
}

/* ────────────────────────────── Los permisos ────────────────────────────── */

export type PermisoConNombre = {
    sujetoTipo: SujetoDePermiso;
    sujetoId: string;
    sujetoNombre: string | null;
    permiso: Permiso;
};

export async function leerLosPermisosAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
}): Promise<Respuesta<PermisoConNombre[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    if (!objetoId) return NO("Falta el objeto.");

    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes ver sus permisos.");

    const filas = await losPermisosDe({ objetoTipo, objetoId });
    const ids = Array.from(new Set(filas.map((f) => f.sujetoId)));

    const { db } = await import("@/lib/db");
    const gente = ids.length
        ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
    const nombres = new Map(gente.map((g) => [g.id, g.name]));

    return {
        success: true,
        data: filas.map((f) => ({
            sujetoTipo: f.sujetoTipo,
            sujetoId: f.sujetoId,
            sujetoNombre: nombres.get(f.sujetoId) ?? null,
            permiso: f.permiso,
        })),
    };
}

/**
 * Con quién se puede compartir: las personas y las cuentas.
 *
 * **La misma lista que ofrece el selector es la que valida `ponerPermisoAction`.**
 * Con dos criterios, el desplegable ofrece a alguien que al guardar se cae sin
 * decir por qué — es la regla que ya rige en `setFlowSharesAction`.
 *
 * ## La gente sale de la FAMILIA, no de una sola cuenta
 *
 * Antes se pedía `ownerId = <mi cuenta>`, o sea **solo mi equipo**. Con eso, a
 * un administrador de una cuenta asociada —Yair en «Verzay | Atencion»— no se
 * le podía dar acceso a nada a su nombre: no salía en la lista. La única
 * opción que quedaba era compartir con su **cuenta**, que alcanza a su equipo
 * entero, y no siempre es lo que se quiere.
 *
 * La familia es la misma de siempre, `laFamiliaDeLaCuenta`: el componente
 * entero de `linked_accounts`, en los dos sentidos. Y **no es una malla
 * cualquiera**: esa función ya recorre los ciclos sin colgarse, que es lo que
 * costó una vuelta en el chat de equipo. Si se resuelve mal, se sigue con la
 * cuenta sola —el lado seguro, se ofrece de menos y nunca de más— y se dice.
 *
 * La **cuenta propia** entra aparte (`id: cuenta`), y esa mitad hace falta: su
 * fila no cuelga de nadie, así que sin ella al jefe no se le podría dar acceso
 * a nada. Es el mismo criterio con el que `soloLasPersonas` reparte en el chat
 * de equipo. Las **demás** cuentas de la familia no entran como personas: ya
 * están en la mitad de abajo, y ofrecerlas dos veces —una como cuenta y otra
 * como persona— es pedirle a alguien que adivine la diferencia.
 */
async function losQueSePuedeCompartir(cuenta: string): Promise<Compartible[]> {
    const { db } = await import("@/lib/db");
    const { cuentasParaCompartir } = await import("@/lib/cuentas-cliente");
    const { laFamiliaDeLaCuenta } = await import("@/lib/familia-de-cuentas");

    const familia = await laFamiliaDeLaCuenta(cuenta);
    const deLaFamilia = Array.from(new Set([cuenta, ...familia.cuentas].filter(Boolean)));

    const [gente, cuentas] = await Promise.all([
        db.user.findMany({
            where: { OR: [{ ownerId: { in: deLaFamilia } }, { id: cuenta }] },
            select: { id: true, name: true, email: true, ownerId: true },
            orderBy: { name: "asc" },
        }),
        cuentasParaCompartir(cuenta),
    ]);

    // De qué cuenta es cada persona, para decirlo al lado del correo: «Yair
    // Silvera» a secas no distingue a la de tu equipo de la de la cuenta
    // asociada, y elegir a la que no era escribe un permiso que no abre nada.
    const comoSeLlamaLaCuenta = new Map(cuentas.map((c) => [c.id, nombreDeLaCuenta(c)]));

    return [
        ...gente.map((g) => {
            const suCuenta = g.ownerId && g.ownerId !== cuenta ? comoSeLlamaLaCuenta.get(g.ownerId) : null;
            return {
                sujetoTipo: "persona" as const,
                sujetoId: g.id,
                etiqueta: g.name ?? g.email,
                detalle: suCuenta ? `${g.email} · ${suCuenta}` : g.email,
            };
        }),
        ...cuentas.map((c) => ({
            sujetoTipo: "cuenta" as const,
            sujetoId: c.id,
            // **No `c.company` a secas.** Nace con «Empresa Demo» por defecto,
            // así que el selector salía con tres filas idénticas y no había
            // forma de elegir. Ver `lib/nombre-de-la-cuenta.ts`.
            etiqueta: nombreDeLaCuenta(c),
            detalle: c.email,
        })),
    ];
}

export async function loQueSePuedeCompartirAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
}): Promise<Respuesta<Compartible[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    if (!objetoId) return NO("Falta el objeto.");

    // La lista va detrás de la MISMA puerta que repartir. Ofrecer las cuentas
    // de la plataforma a quien no puede compartir nada sería enseñar de balde
    // quién hay dentro.
    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes repartir esto.");

    try {
        return { success: true, data: await losQueSePuedeCompartir(quien.cuenta) };
    } catch (error) {
        // Sin candidatos no se puede compartir con nadie, así que el fallo no
        // puede ser mudo: un selector siempre vacío se lee como que compartir
        // no funciona.
        console.warn("[documentacion] no se pudo leer con quién compartir", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo leer la lista.");
    }
}

export async function ponerPermisoAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
    sujetoTipo: unknown;
    sujetoId: unknown;
    permiso: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    const sujetoTipo = comoSujeto(input.sujetoTipo);
    const sujetoId = comoId(input.sujetoId);
    const permiso = comoPermiso(input.permiso);
    if (!objetoId || !sujetoTipo || !sujetoId || !permiso) return NO("Faltan datos.");

    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes repartir esto.");

    // El sujeto tiene que estar en la lista que el selector OFRECE, no solo
    // existir. Comprobando solo que exista, una petición a mano le daba acceso
    // a una persona de otra cuenta —que no se ofrece por ningún lado— y esa
    // persona empezaba a leer el espacio. Y es la misma lista, no una más
    // estrecha: con dos criterios, el selector ofrece a alguien que al guardar
    // se cae sin decir por qué.
    const candidatos = await losQueSePuedeCompartir(quien.cuenta);
    const ofrecido = candidatos.some(
        (c) => c.sujetoTipo === sujetoTipo && c.sujetoId === sujetoId,
    );
    if (!ofrecido) return NO("Esa cuenta o persona no está en la lista.");

    try {
        await ponerPermiso({ objetoTipo, objetoId, sujetoTipo, sujetoId, permiso });
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo guardar el permiso", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo guardar el permiso.");
    }
}

/* ──────────────────── Compartir con OTRAS CUENTAS ───────────────────────── */

/**
 * Las dos acciones que alimentan `CompartirConCuentasDialog`, el diálogo que ya
 * usan Proyectos y Diagramas.
 *
 * **El diálogo no se copia: se reutiliza tal cual.** Fue escrito con
 * `cargar`/`guardar` como huecos justamente para esto («lo que cambia entre los
 * dos son los datos»), así que aquí solo hay que traer la lista y guardarla. Lo
 * que **sí** es distinto es dónde se escribe: Proyectos tiene `project_shares`
 * y Diagramas `flow_shares`, y Documentación escribe en `doc_permisos`, que es
 * su propia tabla y la que lee su propia puerta.
 *
 * Y esa es la regla que no se puede ablandar:
 *
 * > **Lo compartido no se salta `accesoAEsteEspacio` / `accesoAEsteDocumento`.**
 * > Las 30 acciones de este módulo no van por `lib/cuenta-de-la-accion.ts`: su
 * > puerta es más estrecha —además de «¿alcanzas esta cuenta?» pregunta «¿y
 * > este espacio?»—. Una fila de compartir escrita por otro camino, en otra
 * > tabla, sería un acceso que esa puerta no mira: el documento se abriría sin
 * > que `accesoAlDocumento` hubiera dicho que sí.
 *
 * Por eso aquí no hay ninguna tabla nueva. Una cuenta con la que se comparte es
 * una fila `sujetoTipo = 'cuenta'` de `doc_permisos`, exactamente igual que si
 * se hubiera añadido desde el otro diálogo, y la lee la misma función pura.
 */
export type CuentaCompartida = {
    id: string;
    name: string | null;
    email: string;
    company: string;
    compartido: boolean;
    permiso: Permiso;
};

export async function lasCuentasParaCompartirAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
}): Promise<Respuesta<CuentaCompartida[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    if (!objetoId) return NO("Falta el objeto.");

    // La MISMA puerta que repartir. Enseñar la lista de cuentas de la
    // plataforma a quien no puede compartir nada es decir de balde quién hay.
    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes repartir esto.");

    try {
        const { cuentasParaCompartir } = await import("@/lib/cuentas-cliente");
        const [cuentas, filas] = await Promise.all([
            cuentasParaCompartir(quien.cuenta),
            losPermisosDe({ objetoTipo, objetoId }),
        ]);

        const yaTiene = new Map(
            filas.filter((f) => f.sujetoTipo === "cuenta").map((f) => [f.sujetoId, f.permiso]),
        );

        return {
            success: true,
            data: cuentas.map((c) => ({
                ...c,
                compartido: yaTiene.has(c.id),
                // Sin fila todavía, el diálogo arranca en lo más flojo: encender
                // el interruptor no puede dar edición sin que nadie la pida.
                permiso: yaTiene.get(c.id) ?? "lectura",
            })),
        };
    } catch (error) {
        console.warn("[documentacion] no se pudieron leer las cuentas para compartir", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo leer la lista de cuentas.");
    }
}

export async function compartirConCuentasAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
    destinos: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    if (!objetoId) return NO("Falta el objeto.");

    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes repartir esto.");

    const crudos = Array.isArray(input.destinos) ? input.destinos : [];
    const pedidos: Array<{ cuentaId: string; permiso: Permiso }> = [];
    for (const crudo of crudos) {
        const fila = crudo as { accountUserId?: unknown; permiso?: unknown };
        const cuentaId = comoId(fila?.accountUserId);
        const permiso = comoPermiso(fila?.permiso);
        if (cuentaId && permiso) pedidos.push({ cuentaId, permiso });
    }

    try {
        // **La lista que llega del navegador no decide a quién se le abre.** Se
        // cruza contra las cuentas que de verdad se pueden nombrar, que es la
        // misma consulta que alimenta el diálogo: con dos criterios, uno ofrece
        // algo que el otro rechaza —o peor, acepta algo que nunca se ofreció—.
        const { cuentasParaCompartir } = await import("@/lib/cuentas-cliente");
        const permitidas = new Set((await cuentasParaCompartir(quien.cuenta)).map((c) => c.id));
        const destinos = pedidos.filter((d) => permitidas.has(d.cuentaId));
        if (destinos.length !== pedidos.length) {
            // No se rechaza la petición entera: se filtra y se dice. Es lo que
            // ya hace la App con los seguimientos de otra línea, y lo que evita
            // que un id rancio del navegador tire el guardado bueno de al lado.
            console.warn("[documentacion] se pidió compartir con una cuenta que no se ofrece", {
                pedidas: pedidos.length,
                permitidas: destinos.length,
            });
        }

        await reemplazarLasCuentas({ objetoTipo, objetoId, destinos });
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo guardar con qué cuentas se comparte", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo guardar con quién se comparte.");
    }
}

export async function quitarPermisoAction(input: {
    objetoTipo: unknown;
    objetoId: unknown;
    sujetoTipo: unknown;
    sujetoId: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const objetoTipo = input.objetoTipo === "documento" ? "documento" : "espacio";
    const objetoId = comoId(input.objetoId);
    const sujetoTipo = comoSujeto(input.sujetoTipo);
    const sujetoId = comoId(input.sujetoId);
    if (!objetoId || !sujetoTipo || !sujetoId) return NO("Faltan datos.");

    const acceso =
        objetoTipo === "espacio"
            ? await accesoAEsteEspacio(quien.user, objetoId)
            : await accesoAEsteDocumento(quien.user, objetoId);
    if (!acceso) return NO("No autorizado.");
    if (!acceso.acceso.puedeGestionar) return NO("No puedes repartir esto.");

    try {
        await quitarPermiso({ objetoTipo, objetoId, sujetoTipo, sujetoId });
        revalidatePath("/documentos");
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo quitar el permiso", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo quitar el permiso.");
    }
}

/* ────────────────────────────── El historial ────────────────────────────── */

export async function leerElHistorialAction(input: {
    id: unknown;
}): Promise<Respuesta<Version[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta el documento.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");

    return { success: true, data: await lasVersionesDe(id) };
}

export async function leerUnaVersionAction(input: {
    id: unknown;
    version: unknown;
}): Promise<Respuesta<Version>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    const version = Number(input.version);
    if (!id || !Number.isInteger(version)) return NO("Faltan datos.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");

    const fila = await laVersion({ documentoId: id, version });
    if (!fila) return NO("Esa versión ya no está.");
    return { success: true, data: fila };
}

/**
 * Vuelve a una versión anterior.
 *
 * **Volver atrás es un cambio más, no un borrado.** Se guarda como una versión
 * nueva con el contenido de la vieja, así que el historial conserva que se
 * volvió y desde dónde. Reescribiendo la fila del documento y tirando las
 * versiones de en medio, deshacer una vuelta atrás sería imposible — y es justo
 * lo que se hace cuando alguien se equivoca al restaurar.
 */
export async function volverALaVersionAction(input: {
    id: unknown;
    version: unknown;
}): Promise<Respuesta<{ version: number }>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    const version = Number(input.version);
    if (!id || !Number.isInteger(version)) return NO("Faltan datos.");

    const encontrado = await accesoAEsteDocumento(quien.user, id);
    if (!encontrado) return NO("Ese documento no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes editar este documento.");

    const vieja = await laVersion({ documentoId: id, version });
    if (!vieja) return NO("Esa versión ya no está.");

    try {
        const resultado = await guardarDocumento({
            id,
            titulo: vieja.titulo,
            contenido: vieja.contenido,
            autorId: quien.personaId,
            autorNombre: quien.personaNombre,
        });
        revalidatePath("/documentos");
        return { success: true, data: { version: resultado.version } };
    } catch (error) {
        console.warn("[documentacion] no se pudo volver a la version", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo volver a esa versión.");
    }
}

/* ────────────────────────────── La búsqueda ─────────────────────────────── */

export type ResultadoDeBusqueda = {
    id: string;
    titulo: string;
    espacioId: string;
    espacioNombre: string;
    tipo: TipoDeDocumento;
    extracto: string;
    actualizadoEn: Date;
};

export async function buscarAction(input: {
    texto: unknown;
}): Promise<Respuesta<ResultadoDeBusqueda[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const crudo = typeof input.texto === "string" ? input.texto : "";
    const consulta = comoConsultaDeBusqueda(crudo);
    if (!consulta) return { success: true, data: [] };

    const { espacios, contenedores, permisos } = await losEspaciosQueAlcanza(quien.user);
    const conYSin = [...espacios, ...contenedores];
    if (conYSin.length === 0) return { success: true, data: [] };

    // Decidir va con los espacios de verdad; **buscar**, también dentro de los
    // que solo se alcanzan por un documento suelto: si no, un documento
    // compartido de uno en uno sería inencontrable. El filtro fino de abajo es
    // el que deja pasar solo ese y no sus vecinos.
    const porId = new Map(espacios.map((e) => [e.espacio.id, e.espacio]));
    // Y uno aparte SOLO para pintar el nombre del sitio. Decidir y pintar son
    // dos preguntas: con los contenedores en el de decidir se abriría el
    // espacio entero, y sin ellos en el de pintar el resultado saldría sin
    // decir dónde vive.
    const nombres = new Map(conYSin.map((e) => [e.espacio.id, e.espacio.nombre]));

    try {
        const crudos = await buscarDocumentos({
            consulta,
            // La PUERTA: no se busca donde no se puede leer. Y sale de la misma
            // función que arma el árbol, para que no haya dos condiciones de
            // permisos que mantener a la par.
            espacioIds: conYSin.map((e) => e.espacio.id),
            tope: TOPE_DE_RESULTADOS,
        });

        // Y el filtro fino encima, por si hay documentos restringidos dentro de
        // un espacio que sí se alcanza.
        const visibles = losQueAlcanzaDeEstos(quien.user, crudos, porId, permisos);

        return {
            success: true,
            data: visibles.map((d) => ({
                id: d.id,
                titulo: d.titulo,
                espacioId: d.espacioId,
                espacioNombre: nombres.get(d.espacioId) ?? "",
                tipo: d.tipo,
                extracto: extractoConLoBuscado(d.texto, crudo),
                actualizadoEn: d.actualizadoEn,
            })),
        };
    } catch (error) {
        console.warn("[documentacion] la busqueda fallo", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo buscar. Vuelve a intentarlo.");
    }
}

/* ───────────────────────────── Los retroenlaces ─────────────────────────── */

export type DocumentoQueNombra = {
    id: string;
    titulo: string;
    espacioNombre: string;
    actualizadoEn: Date;
};

/**
 * Los documentos que nombran a una cosa: el retroenlace.
 *
 * **Filtrado por lo que quien pregunta alcanza.** Es la mitad que importa y la
 * más fácil de olvidar, porque esto no se pide desde la pantalla de
 * documentación: se pide desde la ficha de una tarea o de un ticket. Sin el
 * filtro, abrir una tarea enseñaría el título de un documento restringido que
 * esa persona no puede abrir — una fuga por la puerta de al lado.
 */
export async function losDocumentosQueNombranAction(input: {
    tipo: unknown;
    refId: unknown;
}): Promise<Respuesta<DocumentoQueNombra[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const tipo = comoTipoDeMencion(input.tipo);
    const refId = comoId(input.refId);
    if (!tipo || !refId) return NO("Faltan datos.");

    try {
        const candidatos = await losQueNombran({ tipo, refId });
        if (candidatos.length === 0) return { success: true, data: [] };

        const { espacios, contenedores, permisos } = await losEspaciosQueAlcanza(quien.user);
        // Decidir con los de verdad; pintar el nombre, con todos. Ver la misma
        // separación en `buscarAction`.
        const porId = new Map(espacios.map((e) => [e.espacio.id, e.espacio]));
        const nombres = new Map(
            [...espacios, ...contenedores].map((e) => [e.espacio.id, e.espacio.nombre]),
        );

        const visibles = losQueAlcanzaDeEstos(
            quien.user,
            candidatos.map((c) => ({
                id: c.documentoId,
                cuentaId: c.cuentaId,
                espacioId: c.espacioId,
                restringido: c.restringido,
                creadoPorId: c.creadoPorId,
                titulo: c.titulo,
                actualizadoEn: c.actualizadoEn,
            })),
            porId,
            permisos,
        );

        return {
            success: true,
            data: visibles.map((d) => ({
                id: d.id,
                titulo: d.titulo,
                espacioNombre: nombres.get(d.espacioId) ?? "",
                actualizadoEn: d.actualizadoEn,
            })),
        };
    } catch (error) {
        console.warn("[documentacion] no se pudieron leer los retroenlaces", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudieron leer los documentos.");
    }
}

/* ─────────────────────── Lo que se puede mencionar ──────────────────────── */

export type Mencionable = { tipo: TipoDeMencion; refId: string; etiqueta: string };

/**
 * Lo que se puede mencionar desde un documento, para el selector de la arroba.
 *
 * **Solo lo de la cuenta de quien escribe.** El selector es una lista que sale
 * del servidor, así que ofrecer algo de otra cuenta sería enseñar el nombre de
 * un cliente ajeno dentro de un desplegable.
 */
export async function loQueSePuedeMencionarAction(input: {
    texto: unknown;
}): Promise<Respuesta<Mencionable[]>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const buscado = typeof input.texto === "string" ? input.texto.trim().slice(0, 60) : "";
    const { db } = await import("@/lib/db");
    const contiene = buscado ? { contains: buscado, mode: "insensitive" as const } : undefined;

    try {
        const [clientes, tareas, tickets, documentos] = await Promise.all([
            db.user.findMany({
                where: { ownerId: quien.cuenta, ...(contiene ? { name: contiene } : {}) },
                select: { id: true, name: true },
                take: 8,
            }),
            db.task.findMany({
                where: { ownerId: quien.cuenta, ...(contiene ? { title: contiene } : {}) },
                select: { id: true, title: true },
                orderBy: { id: "desc" },
                take: 8,
            }),
            db.$queryRaw<Array<{ id: string; titulo: string }>>`
                SELECT "id", "titulo" FROM "tickets_de_soporte"
                WHERE ("clienteId" = ${quien.cuenta} OR "destinoId" = ${quien.cuenta})
                ORDER BY "creadoEn" DESC LIMIT 8
            `.catch(() => []),
            db.$queryRaw<Array<{ id: string; titulo: string }>>`
                SELECT "id", "titulo" FROM "doc_documentos"
                WHERE "cuentaId" = ${quien.cuenta} AND "tipo" <> 'plantilla'
                ORDER BY "actualizadoEn" DESC LIMIT 8
            `.catch(() => []),
        ]);

        const salida: Mencionable[] = [
            ...clientes.map((c) => ({
                tipo: "cliente" as const,
                refId: c.id,
                etiqueta: c.name ?? c.id,
            })),
            ...tareas.map((t) => ({
                tipo: "tarea" as const,
                refId: String(t.id),
                etiqueta: t.title ?? String(t.id),
            })),
            ...tickets.map((t) => ({ tipo: "ticket" as const, refId: t.id, etiqueta: t.titulo })),
            ...documentos.map((d) => ({
                tipo: "documento" as const,
                refId: d.id,
                etiqueta: d.titulo,
            })),
        ];

        return { success: true, data: salida };
    } catch (error) {
        console.warn("[documentacion] no se pudo leer lo mencionable", {
            error: error instanceof Error ? error.message : String(error),
        });
        // Se devuelve vacío y no un fallo: sin selector todavía se puede
        // escribir. Pero no es mudo, que un selector que nunca ofrece nada se
        // lee como que mencionar no funciona.
        return { success: true, data: [] };
    }
}

/* ─────────────────────────── Las filas de una lista ─────────────────────── */

async function accesoAlaListaDeLaFila(user: Parameters<typeof accesoAEsteDocumento>[0], filaId: string) {
    const fila = await laFila(filaId);
    if (!fila) return null;
    const encontrado = await accesoAEsteDocumento(user, fila.documentoId);
    if (!encontrado) return null;
    return { fila, acceso: encontrado.acceso };
}

export async function crearFilaAction(input: {
    documentoId: unknown;
    titulo: unknown;
    estado?: unknown;
    fecha?: unknown;
    asignadoId?: unknown;
    notas?: unknown;
}): Promise<Respuesta<FilaDeLista>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const documentoId = comoId(input.documentoId);
    if (!documentoId) return NO("Falta la lista.");

    const encontrado = await accesoAEsteDocumento(quien.user, documentoId);
    if (!encontrado) return NO("Esa lista no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes escribir en esta lista.");
    if (encontrado.documento.tipo !== "lista") return NO("Eso no es una lista.");

    const titulo = comoTitulo(input.titulo);
    if (!titulo) return NO("La fila necesita un título.");

    const cuantas = await cuantasFilasTiene(documentoId);
    if (cuantas >= TOPE_DE_FILAS) {
        return NO(`Una lista admite ${TOPE_DE_FILAS} filas. Divídela en dos.`);
    }

    // El estado se comprueba contra las columnas de ESTA lista: uno inventado
    // sería una fila que no sale en ninguna columna del tablero.
    const estados = encontrado.documento.estados;
    const pedido = typeof input.estado === "string" ? input.estado.trim() : "";
    const estado = estados.includes(pedido) ? pedido : estados[0];

    const asignadoId = comoId(input.asignadoId);
    let asignadoNombre: string | null = null;
    if (asignadoId) {
        const { db } = await import("@/lib/db");
        const quienEs = await db.user.findUnique({
            where: { id: asignadoId },
            select: { name: true },
        });
        asignadoNombre = quienEs?.name ?? null;
    }

    try {
        const fila = await crearFila({
            documentoId,
            cuentaId: encontrado.documento.cuentaId,
            titulo,
            estado,
            fecha: comoFecha(input.fecha),
            asignadoId,
            asignadoNombre,
            notas: typeof input.notas === "string" ? input.notas.slice(0, 2000) : null,
            creadoPorId: quien.personaId,
        });
        // Entra al FINAL de su columna. Sin esto la fila nueva saldría arriba
        // del todo y pisaría el orden que puso una persona a mano — es la misma
        // regla que en los otros dos tableros.
        await alFinalDelTablero("documentacion", documentoId, fila.id);
        return { success: true, data: fila };
    } catch (error) {
        console.warn("[documentacion] no se pudo crear la fila", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo crear la fila.");
    }
}

export async function editarFilaAction(input: {
    id: unknown;
    titulo?: unknown;
    estado?: unknown;
    fecha?: unknown;
    notas?: unknown;
}): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta la fila.");

    const encontrado = await accesoAlaListaDeLaFila(quien.user, id);
    if (!encontrado) return NO("Esa fila no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes editar esta lista.");

    const titulo = input.titulo === undefined ? undefined : comoTitulo(input.titulo);
    if (input.titulo !== undefined && !titulo) return NO("La fila necesita un título.");

    // El estado se comprueba contra las columnas de ESTA lista, igual que al
    // crear: uno inventado sería una fila que no sale en ninguna columna.
    let estado: string | undefined;
    if (typeof input.estado === "string") {
        const pedido = input.estado.trim();
        const abierta = await accesoAEsteDocumento(quien.user, encontrado.fila.documentoId);
        const estados = abierta?.documento.estados ?? [];
        if (!estados.includes(pedido)) return NO("Esa columna ya no existe en la lista.");
        estado = pedido;
    }

    try {
        await editarFila({
            id,
            titulo: titulo ?? undefined,
            estado,
            fecha: input.fecha === undefined ? undefined : comoFecha(input.fecha),
            notas:
                input.notas === undefined
                    ? undefined
                    : typeof input.notas === "string"
                      ? input.notas.slice(0, 2000)
                      : null,
        });
        // Al cambiar de columna se va al final de la nueva. Sin esto conserva
        // el número de su columna ANTERIOR, que pertenece a otra banda, y
        // aparece en mitad de la nueva hasta que alguien recarga — que es justo
        // «no se queda donde la dejo».
        if (estado && estado !== encontrado.fila.estado) {
            await alFinalDelTablero("documentacion", encontrado.fila.documentoId, id);
        }
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo editar la fila", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo guardar la fila.");
    }
}

export async function borrarFilaAction(input: { id: unknown }): Promise<Respuesta<true>> {
    const quien = await quienLlama();
    if (!quien) return NO("No autorizado.");

    const id = comoId(input.id);
    if (!id) return NO("Falta la fila.");

    const encontrado = await accesoAlaListaDeLaFila(quien.user, id);
    if (!encontrado) return NO("Esa fila no existe o no tienes acceso.");
    if (!encontrado.acceso.puedeEditar) return NO("No puedes editar esta lista.");

    try {
        await borrarFila(id);
        // Sin clave foránea, la limpieza es explícita. `olvidarLaTarjeta` nunca
        // lanza: no puede reventar el borrado.
        await olvidarLaTarjeta("documentacion", encontrado.fila.documentoId, id);
        return { success: true, data: true };
    } catch (error) {
        console.warn("[documentacion] no se pudo borrar la fila", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NO("No se pudo borrar la fila.");
    }
}

/**
 * Una fecha que llega del navegador.
 *
 * `null` y «fecha inválida» son dos cosas: la primera es «esta fila no tiene
 * fecha» y es legítima —el calendario la cuenta aparte y lo dice—; la segunda
 * es un dato roto, y guardarlo dejaría una fila que el calendario no sabe dónde
 * poner. Las dos acaban en `null` a propósito, pero por caminos distintos.
 */
function comoFecha(valor: unknown): Date | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const fecha = valor instanceof Date ? valor : new Date(String(valor));
    return isNaN(fecha.getTime()) ? null : fecha;
}
