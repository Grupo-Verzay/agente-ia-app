/**
 * Mover una persona de una cuenta a otra.
 *
 * ## Lo que hay que saber antes de tocar nada: su id NO cambia
 *
 * En esta plataforma **lo que se firma se guarda con el id de la persona y lo
 * que se alcanza se resuelve por la fila efectiva** (ver *lo que se LEE por
 * persona se ESCRIBE por persona*). Así que mudarla no es arrastrar sus datos:
 * sus notas, sus chats tomados, sus comentarios, su historial de actividad, sus
 * permisos de documentos y todo lo que ella firmó **ya cuelgan de su id**, y su
 * id es el mismo antes y después.
 *
 * Lo que de verdad cambia al mudarla es el **ALCANCE**: las pantallas acotan
 * por `ownerId ?? id`, así que lo que deja de ver no es lo suyo — es lo de la
 * cuenta que deja.
 *
 * De ahí salen las dos mitades de este módulo:
 *
 * 1. **Qué se escribe**, que es poquísimo y está en `queSeEscribe`.
 * 2. **Qué deja de alcanzar**, que es lo que hay que contarle a quien decide
 *    ANTES de aplicar nada (`laSuerteDeCadaArea`).
 *
 * Es puro a propósito: entra quién es, a dónde va y con qué rol, y sale el
 * plan. La base solo pone los números.
 */

/** Los dos papeles que puede tener alguien dentro de una cuenta. */
export type RolDeDestino = "administrador" | "agente";

/** Lo que hace falta saber de la persona que se muda. */
export type PersonaQueSeMuda = {
    id: string;
    /** La cuenta de la que cuelga hoy. `null` = no es del equipo de nadie. */
    ownerId: string | null;
    advisorRole: string | null;
};

/** Lo que hace falta saber de la cuenta de destino. */
export type CuentaDeDestino = {
    id: string;
    /**
     * Tiene que ser `null`. Una cuenta es una fila SIN dueño; si tuviera uno
     * sería una persona del equipo de otra, y colgar a alguien de una persona
     * es una cadena de dos niveles que ninguna de las reglas de esta casa
     * contempla — `cuentaQueManda` lee `persona.ownerId` y da por hecho que esa
     * fila ya es la cuenta.
     */
    ownerId: string | null;
};

/** Por qué no se puede mudar. `null` = se puede. */
export type NoSePuede =
    | "sin_persona"
    | "sin_destino"
    | "no_es_del_equipo"
    | "el_destino_no_es_una_cuenta"
    | "el_destino_es_ella_misma"
    | "ya_esta_en_esa_cuenta";

/** Lo que se le enseña a quien decide, en sus palabras. */
export const PORQUE: Record<NoSePuede, string> = {
    sin_persona: "No se dijo a quién mover.",
    sin_destino: "No se dijo a qué cuenta.",
    no_es_del_equipo:
        "Esa fila no es del equipo de nadie: es una cuenta, y una cuenta no se muda. " +
        "Para colgarla de otra se usan las cuentas vinculadas.",
    el_destino_no_es_una_cuenta:
        "El destino tiene dueño, así que es una persona y no una cuenta. " +
        "Nadie puede colgar de otra persona.",
    el_destino_es_ella_misma: "No se puede colgar a alguien de sí mismo.",
    ya_esta_en_esa_cuenta: "Ya está en esa cuenta.",
};

/**
 * Las cinco puertas, en orden. Se comprueba **en el servidor** y no solo al
 * pintar el selector: esto escribe sobre `User`, y una acción es un endpoint.
 */
export function porQueNoSePuedeMudar(
    persona: PersonaQueSeMuda | null | undefined,
    destino: CuentaDeDestino | null | undefined,
): NoSePuede | null {
    if (!persona?.id) return "sin_persona";
    if (!destino?.id) return "sin_destino";
    // Sin dueño es una CUENTA, no alguien del equipo. Mudar una cuenta con esto
    // sería convertirla en persona de otra y llevarse por delante a su propio
    // equipo, que cuelga de ella por `owner_id`.
    if (!persona.ownerId) return "no_es_del_equipo";
    if (destino.ownerId) return "el_destino_no_es_una_cuenta";
    if (destino.id === persona.id) return "el_destino_es_ella_misma";
    if (destino.id === persona.ownerId) return "ya_esta_en_esa_cuenta";
    return null;
}

/**
 * El rol con el que llega. Lo que no esté en la lista cae en `agente`, **nunca
 * en `administrador`**: equivocarse hacia abajo se ve en un minuto y se
 * corrige; equivocarse hacia arriba le da la cuenta entera a quien no la pidió.
 */
export function comoRolDeDestino(valor: unknown): RolDeDestino {
    return valor === "administrador" ? "administrador" : "agente";
}

/** Lo que la mudanza escribe. Y no hay nada más. */
export type QueSeEscribe = {
    /** `User.owner_id` y `User.advisor_role` de esta persona. */
    personaId: string;
    deLaCuenta: string;
    aLaCuenta: string;
    rol: RolDeDestino;
};

export function queSeEscribe(
    persona: PersonaQueSeMuda,
    destino: CuentaDeDestino,
    rol: RolDeDestino,
): QueSeEscribe {
    return {
        personaId: persona.id,
        deLaCuenta: persona.ownerId ?? "",
        aLaCuenta: destino.id,
        rol,
    };
}

/* ─────────────────────── Lo que deja de alcanzar ────────────────────────── */

/**
 * Las áreas cuyo alcance cambia al mudarse. No están todas las de la
 * plataforma: están **las que se acotan por cuenta y tienen algo suyo dentro**,
 * que son las que alguien va a echar en falta.
 */
export type Area =
    | "chats"
    | "tareas"
    | "proyectos"
    | "canales_de_area"
    | "directos"
    | "general"
    | "documentos_de_la_cuenta"
    | "permisos_propios"
    | "cartera";

export type Suerte = "sigue" | "se_pierde";

/** Por qué cada una, para que el informe no sea una lista de palabras. */
export type SuerteDelArea = { suerte: Suerte; porque: string };

/**
 * Qué pasa con cada área, según el rol de destino y si las dos cuentas están en
 * la misma familia (`linked_accounts`, la malla del #812).
 *
 * **El rol importa y la familia también, y no dicen lo mismo:**
 *
 * - La **bandeja de Chats** alcanza un nivel de `linked_accounts` en los dos
 *   sentidos… pero solo si NO se es agente: `esAgenteDeLaCuenta` corta la lista
 *   a las líneas propias. Así que una agente pierde sus chats tomados en las
 *   líneas de la cuenta que deja, y una administradora no.
 * - **Tareas y Proyectos NO miran vinculadas en absoluto**: sus consultas van
 *   con `ownerId = user.ownerId ?? user.id` a secas. Se pierden con los dos
 *   roles, y eso es lo que hay que decir antes de mudar a nadie.
 * - El **General** del chat de equipo se lee sobre la FAMILIA entera, así que
 *   dentro de la misma familia no cambia nada.
 * - Un **directo** se encuentra por pertenencia y no por cuenta, así que nunca
 *   se pierde.
 *
 * Es puro para que el informe se pueda probar sin levantar nada, y para que la
 * pantalla y el servidor no puedan discrepar sobre lo que se le prometió.
 */
export function laSuerteDeCadaArea(input: {
    rol: RolDeDestino;
    /** Si origen y destino están unidas por `linked_accounts`. */
    mismaFamilia: boolean;
}): Record<Area, SuerteDelArea> {
    const { rol, mismaFamilia } = input;
    const manda = rol === "administrador";
    // La bandeja suma las líneas de las cuentas vinculadas, y solo a quien no
    // es agente.
    const alcanzaLasLineasDeAntes = manda && mismaFamilia;

    return {
        chats: alcanzaLasLineasDeAntes
            ? {
                  suerte: "sigue",
                  porque:
                      "La bandeja suma las líneas de las cuentas vinculadas, un nivel y en los dos sentidos.",
              }
            : {
                  suerte: "se_pierde",
                  porque: manda
                      ? "Las dos cuentas no están vinculadas, así que la bandeja no alcanza las líneas de la de antes."
                      : "Un agente solo ve las líneas de su propia cuenta, aunque estén vinculadas.",
              },
        tareas: {
            suerte: "se_pierde",
            porque:
                "Tareas acota con `ownerId` a secas y no mira cuentas vinculadas: no podrá ni abrirlas. Reasignarlas antes.",
        },
        proyectos: {
            suerte: "se_pierde",
            porque:
                "Un proyecto cuelga de su cuenta dueña, y sus tareas con él. Se queda en el tablero que deja.",
        },
        canales_de_area: {
            suerte: "se_pierde",
            porque:
                "Un canal de área se encuentra por la cuenta del canal. Se recupera repartiéndole ese canal a la cuenta nueva.",
        },
        directos: {
            suerte: "sigue",
            porque: "Un directo se encuentra porque se está dentro, no por la cuenta de la que cuelga.",
        },
        general: mismaFamilia
            ? { suerte: "sigue", porque: "El General se lee sobre la familia entera." }
            : {
                  suerte: "se_pierde",
                  porque: "El General es de la familia, y la cuenta nueva es de otra.",
              },
        documentos_de_la_cuenta: {
            suerte: "se_pierde",
            porque:
                "Lo que se compartió con la CUENTA de antes lo alcanzaba por estar en ella. Lo compartido con ELLA sigue.",
        },
        permisos_propios: {
            suerte: "sigue",
            porque: "`doc_permisos` con `sujetoTipo = 'persona'` lleva su id, y su id no cambia.",
        },
        cartera: {
            suerte: "sigue",
            porque:
                "`clientesDelAsesor` busca por `advisorUserId`. La mudanza además pasa el `ownerUserId` a la cuenta nueva, para que allí se pueda gestionar.",
        },
    };
}

/* ────────────────────────── Los módulos suyos ───────────────────────────── */

/**
 * Con qué módulos se queda.
 *
 * Alguien del equipo tiene **sus propias filas en `_UserModules`**, y el
 * armazón las usa tal cual: `if (userModuleRecords.length > 0) modules =
 * allModules.filter(...)`. O sea que son una lista de PERMITIDOS y sus ids son
 * globales, así que mudarla sin tocarlas le dejaría abierto un módulo que la
 * cuenta nueva no tiene.
 *
 * **Y la trampa está en el recorte, no en el reparto:** esa misma línea trata
 * «cero filas» como «sin restricción». Recortar a vacío no la deja sin módulos
 * — la deja **sin tope**, viendo todo lo que su plan permita, que es
 * exactamente lo contrario de lo que el recorte viene a hacer. Por eso cuando
 * el cruce se queda en nada se le dan **los de la cuenta nueva**: nunca más que
 * su cuenta, y nunca el «sin tope» de la lista vacía.
 *
 * Quien no tenía ninguna no gana ninguna: ya estaba sin tope y sigue igual,
 * que es lo mismo que le pasa a su cuenta.
 */
export function losModulosQueLeQuedan(
    suyos: readonly string[],
    losDeLaCuentaNueva: readonly string[],
): string[] {
    const mios = [...new Set(suyos.filter(Boolean))];
    if (mios.length === 0) return [];

    const nueva = new Set(losDeLaCuentaNueva.filter(Boolean));
    const cruce = mios.filter((id) => nueva.has(id));
    if (cruce.length > 0) return cruce;

    // Ni uno de los suyos existe en la cuenta nueva. Vaciarlo sería quitarle el
    // tope; se le da el de su cuenta.
    return [...nueva];
}

/** Los que hay que BORRAR de sus filas para llegar a lo de arriba. */
export function losModulosQueSeLeQuitan(
    suyos: readonly string[],
    losDeLaCuentaNueva: readonly string[],
): string[] {
    const quedan = new Set(losModulosQueLeQuedan(suyos, losDeLaCuentaNueva));
    return [...new Set(suyos.filter(Boolean))].filter((id) => !quedan.has(id));
}

/** Y los que hay que AÑADIR. Solo pasa en el caso del cruce vacío. */
export function losModulosQueSeLeDan(
    suyos: readonly string[],
    losDeLaCuentaNueva: readonly string[],
): string[] {
    const tenia = new Set(suyos.filter(Boolean));
    return losModulosQueLeQuedan(suyos, losDeLaCuentaNueva).filter((id) => !tenia.has(id));
}
