/**
 * Quién alcanza un espacio y un documento. **Puro**: entran las filas y sale el
 * veredicto, así que el banco lo ejerce sin levantar nada.
 *
 * Separarlo de `lib/acceso-al-documento.ts` —que es quien va a la base— es lo
 * mismo que se hizo con `repartirEnDosBloques` en la Actividad del equipo: lo
 * que decide la pantalla se prueba, y lo que va a la base solo trae filas.
 *
 * ## La identidad, que es lo que el encargo pedía explícitamente
 *
 * Es el reparto ya unificado del resto de la plataforma:
 *
 * | | qué contesta | con qué |
 * | --- | --- | --- |
 * | **firmar** | quién escribió esto | la **persona** (`laPersonaQueActua`) |
 * | **alcanzar** | hasta dónde llego | la **cuenta** (la fila efectiva) |
 *
 * Aquí solo vive la segunda. La primera la aplican las acciones al escribir
 * `creadoPorId`, `actualizadoPorId` y el autor de cada versión.
 *
 * ## Por qué `sujetoTipo` y no el patrón de `note_shares`
 *
 * `note_shares` guarda un id a secas y quien lee lo cruza con
 * `identidadesQueRecibenCompartidos`, que devuelve la persona **y** su cuenta.
 * Funciona ahí porque compartir una nota significa una sola cosa.
 *
 * Aquí significan dos: compartir con una **persona** es esa persona, y
 * compartir con una **cuenta** es su equipo entero —que es el caso que hace
 * falta para ofrecérselo a un cliente—. Con una columna ambigua no habría forma
 * de distinguirlas: una cuenta también es una fila de `User`. Es la misma razón
 * por la que `team_channel_accounts` se hizo aparte de `team_channel_members`.
 *
 * ## Y un `agente` SÍ lee lo que alcanza su cuenta
 *
 * Es una divergencia a propósito de la regla de las notas, y conviene que esté
 * escrita. En notas, un agente no hereda lo compartido con su cuenta porque una
 * nota compartida con la cuenta no se le asignó a él. Aquí es al revés:
 * compartir un espacio con la cuenta de un cliente **es** para que lo lea su
 * gente, y dejar fuera a los agentes vaciaría la función de sentido.
 *
 * Lo que no cambia es la otra mitad: **participa, no manda**. Un agente lee;
 * crear, borrar y repartir siguen siendo de quien gestiona la cuenta.
 */

import { canManageWorkspace } from "@/lib/workspace-roles";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";

/* ──────────────────────────────── Tipos ─────────────────────────────────── */

export const PERMISOS = ["lectura", "edicion"] as const;
export type Permiso = (typeof PERMISOS)[number];

export function comoPermiso(valor: unknown): Permiso | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as Permiso;
    return (PERMISOS as readonly string[]).includes(v) ? v : null;
}

export const SUJETOS = ["persona", "cuenta"] as const;
export type SujetoDePermiso = (typeof SUJETOS)[number];

export function comoSujeto(valor: unknown): SujetoDePermiso | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as SujetoDePermiso;
    return (SUJETOS as readonly string[]).includes(v) ? v : null;
}

/**
 * De un espacio: quién entra sin que nadie le haya dado nada.
 *
 * - `cuenta` — todo el equipo de la cuenta dueña. Es lo normal y el valor con
 *   el que nace un espacio: la documentación de una empresa la lee su gente.
 * - `restringido` — solo quien tenga una fila de permiso.
 */
export const VISIBILIDADES = ["cuenta", "restringido"] as const;
export type VisibilidadDeEspacio = (typeof VISIBILIDADES)[number];

export function comoVisibilidad(valor: unknown): VisibilidadDeEspacio | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as VisibilidadDeEspacio;
    return (VISIBILIDADES as readonly string[]).includes(v) ? v : null;
}

export type QuienMira = {
    id: string;
    role?: string | null;
    rolDeLaPersona?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
};

export type EspacioParaDecidir = {
    id: string;
    cuentaId: string;
    visibilidad: VisibilidadDeEspacio;
};

export type DocumentoParaDecidir = {
    id: string;
    cuentaId: string;
    espacioId: string;
    /**
     * Restringido dentro de su propio espacio.
     *
     * **Y entonces desaparece también del listado**, no solo de la apertura.
     * Esa es la mitad que no se puede ablandar: un documento que sale en la
     * lista del espacio y al pulsarlo dice «No autorizado» es el menú abierto
     * con la puerta cerrada que este repositorio ya ha pagado cinco veces. Por
     * eso listar y abrir preguntan a esta MISMA función.
     */
    restringido: boolean;
    creadoPorId: string;
};

export type FilaDePermiso = {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    sujetoTipo: SujetoDePermiso;
    sujetoId: string;
    permiso: Permiso;
};

export type Acceso = {
    /** La cuenta DUEÑA. De ella cuelga todo lo que se escriba dentro. */
    cuentaId: string;
    /** Llegó compartido desde otra cuenta. */
    recibido: boolean;
    /** Escribir: el cuerpo, el título, las filas de una lista. */
    puedeEditar: boolean;
    /**
     * Mandar: crear y borrar documentos, renombrar el espacio y decidir con
     * quién se comparte. **Nunca es cierto en uno recibido**, igual que en
     * Proyectos y en Diagramas: repartirlo sigue siendo de quien lo hizo.
     */
    puedeGestionar: boolean;
};

/* ──────────────────────────── Quién eres aquí ───────────────────────────── */

/**
 * La cuenta por la que alguien alcanza cosas.
 *
 * Es `ownerId ?? id` —la fila EFECTIVA—, y no la persona: es la regla escrita
 * en *«un dato que se FIRMA va con la persona; un alcance se pregunta a la fila
 * EFECTIVA»*, que ya costó una regresión al aplicarla del revés en la cartera
 * de clientes.
 */
export function laCuentaDeQuienMira(user: QuienMira): string {
    return (user?.ownerId || user?.id || "").trim();
}

/** Las filas que le tocan a quien mira, de las que llegaron. */
function loQueLeDan(user: QuienMira, permisos: FilaDePermiso[]): Permiso | null {
    const persona = (user?.id || "").trim();
    const cuenta = laCuentaDeQuienMira(user);

    let mejor: Permiso | null = null;
    for (const fila of permisos) {
        const suya =
            (fila.sujetoTipo === "persona" && fila.sujetoId === persona) ||
            (fila.sujetoTipo === "cuenta" && fila.sujetoId === cuenta);
        if (!suya) continue;
        // **Entre dos filas gana la que MÁS deja hacer.** Puede haber una para
        // la persona y otra para su cuenta; quitarle la edición por tener
        // además una de lectura sería un permiso que cambia según por dónde se
        // mire. Es la misma regla de `note_shares`.
        if (fila.permiso === "edicion") return "edicion";
        mejor = "lectura";
    }
    return mejor;
}

/**
 * Solo lo que le dieron a ESTA persona, con nombre y apellidos.
 *
 * Hace falta porque **una fila para la CUENTA y otra para la PERSONA no dicen
 * lo mismo**: la primera alcanza al equipo entero —agentes incluidos— y la
 * segunda se la dieron a alguien a propósito. Es la misma diferencia que ya
 * separa `team_channel_accounts` de `team_channel_members`.
 */
function loQueLeDanAElla(user: QuienMira, permisos: FilaDePermiso[]): Permiso | null {
    const persona = (user?.id || "").trim();
    let mejor: Permiso | null = null;
    for (const fila of permisos) {
        if (fila.sujetoTipo !== "persona" || fila.sujetoId !== persona) continue;
        if (fila.permiso === "edicion") return "edicion";
        mejor = "lectura";
    }
    return mejor;
}

/* ─────────────────────────────── El espacio ─────────────────────────────── */

/**
 * `null` si no lo alcanza — y eso incluye «no existe».
 *
 * Un espacio ajeno se contesta igual que uno que no existe: decir «no puedes»
 * ya revela que existe y de quién es. Misma regla que `getFlowAction` y que
 * `accesoAlProyecto`.
 */
export function accesoAlEspacio(
    user: QuienMira,
    espacio: EspacioParaDecidir,
    permisos: FilaDePermiso[],
): Acceso | null {
    if (!user?.id || !espacio?.id) return null;

    const delEspacio = permisos.filter(
        (p) => p.objetoTipo === "espacio" && p.objetoId === espacio.id,
    );
    const dado = loQueLeDan(user, delEspacio);
    const cuenta = laCuentaDeQuienMira(user);
    const propio = espacio.cuentaId === cuenta;

    // Quien manda en la plataforma manda aquí también, esté en la cuenta que
    // esté. Va PRIMERO: por debajo se pregunta por la cuenta, y desde otra se
    // quedaría fuera. Es la salida temprana de `esSuperAdminDeVerdad`.
    if (esSuperAdminDeVerdad(user)) {
        return {
            cuentaId: espacio.cuentaId,
            recibido: !propio,
            puedeEditar: true,
            // Gestionar uno recibido sigue siendo que no: el reparto es de
            // quien lo hizo, y eso no depende de quién mire.
            puedeGestionar: propio,
        };
    }

    if (propio) {
        const manda = canManageWorkspace(user);

        // Restringido: hace falta una fila… salvo para quien gestiona la
        // cuenta. Es la misma decisión, tomada a propósito, que deja al
        // administrador leer los directos de su cuenta en el chat de equipo:
        // esto es una herramienta de trabajo, no un cajón privado, y sin ella
        // un espacio se volvería inalcanzable el día que su creador se va.
        if (espacio.visibilidad === "restringido" && !manda && !dado) return null;

        return {
            cuentaId: espacio.cuentaId,
            recibido: false,
            puedeEditar: manda || dado === "edicion",
            puedeGestionar: manda,
        };
    }

    // De otra cuenta: solo lo que le hayan dado explícitamente.
    if (!dado) return null;

    return {
        cuentaId: espacio.cuentaId,
        recibido: true,
        // Un `agente` de la cuenta invitada lo ve y no lo toca: en un espacio
        // de otra cuenta no le asignan nada. Mismo reparto que en Proyectos
        // compartidos.
        puedeEditar: dado === "edicion" && canManageWorkspace(user),
        puedeGestionar: false,
    };
}

/* ────────────────────────────── El documento ────────────────────────────── */

/**
 * Lo que alguien puede hacer con UN documento.
 *
 * El espacio decide quién entra; el documento **añade** —una persona de fuera
 * del espacio, o edición a quien solo tenía lectura— y, si está `restringido`,
 * **quita**. Y cuando quita, quita también del listado: ver
 * `DocumentoParaDecidir.restringido`.
 */
export function accesoAlDocumento(
    user: QuienMira,
    documento: DocumentoParaDecidir,
    espacio: EspacioParaDecidir | null,
    permisos: FilaDePermiso[],
): Acceso | null {
    if (!user?.id || !documento?.id) return null;

    const delDocumento = permisos.filter(
        (p) => p.objetoTipo === "documento" && p.objetoId === documento.id,
    );
    const dado = loQueLeDan(user, delDocumento);
    const dadoAElla = loQueLeDanAElla(user, delDocumento);
    const persona = (user.id || "").trim();
    const suyo = documento.creadoPorId === persona;
    const deOtraCuenta = documento.cuentaId !== laCuentaDeQuienMira(user);

    /**
     * Si la fila del documento deja ESCRIBIR, y el mismo reparto que el
     * espacio.
     *
     * En un documento **recibido** de otra cuenta, una fila para la CUENTA
     * alcanza a su equipo entero, así que un `agente` entraría a escribir en
     * la documentación de un cliente: participa, no manda. Es exactamente la
     * condición que `accesoAlEspacio` ya tiene en su rama de recibido
     * (`dado === "edicion" && canManageWorkspace(user)`), y que al documento
     * se le había quedado fuera.
     *
     * Lo que NO se toca es una fila para la **persona**: eso se lo dieron a
     * ella a propósito, sea agente o no. Y dentro de la cuenta propia manda lo
     * de siempre, que es lo que hace que un espacio restringido se pueda abrir
     * a alguien del equipo.
     */
    const escribePorElDocumento = deOtraCuenta
        ? dadoAElla === "edicion" || (dado === "edicion" && canManageWorkspace(user))
        : dado === "edicion";

    const porElEspacio = espacio ? accesoAlEspacio(user, espacio, permisos) : null;

    if (documento.restringido) {
        // Restringido: ni el espacio ni la cuenta bastan. Pasan quien lo
        // escribió, quien tenga una fila sobre ESTE documento, y quien manda
        // —en la cuenta dueña o en la plataforma—, por el mismo motivo que
        // arriba: si no, un documento se pierde con su autor.
        const manda =
            esSuperAdminDeVerdad(user) ||
            (documento.cuentaId === laCuentaDeQuienMira(user) && canManageWorkspace(user));

        if (!suyo && !dado && !manda) return null;

        return {
            cuentaId: documento.cuentaId,
            recibido: deOtraCuenta,
            puedeEditar: suyo || manda || escribePorElDocumento,
            puedeGestionar: suyo || manda,
        };
    }

    // Sin restringir: lo que diga el espacio, y el documento solo puede AÑADIR.
    if (!porElEspacio && !dado && !suyo) return null;

    return {
        cuentaId: documento.cuentaId,
        recibido: deOtraCuenta,
        puedeEditar:
            Boolean(porElEspacio?.puedeEditar) || escribePorElDocumento || (suyo && !deOtraCuenta),
        puedeGestionar: Boolean(porElEspacio?.puedeGestionar) || (suyo && !deOtraCuenta),
    };
}
