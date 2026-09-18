/**
 * Salud del envío: qué salió, qué falló y cuándo hay que mirar.
 *
 * # De dónde viene
 *
 * Un envío automático que falla **falla en silencio**. Los recordatorios de
 * Cobros y los avisos de desconexión llevaban días sin salir por Waha y nadie
 * se enteró hasta que se revisó a mano: el despachador devolvía «No
 * autorizado» y cada llamador lo escribía en la consola del contenedor, que
 * nadie lee. Desde fuera no se parece a un fallo — se parece a que la App no le
 * escribe a nadie.
 *
 * Esto es puro a propósito: entra una lista de envíos y salen el resumen y los
 * avisos, sin tocar la base. Lo que decide si hay que mirar se prueba en el
 * banco sin levantar nada.
 */

/* ── Las dos listas cerradas ──────────────────────────────────────────────── */

/**
 * Los caminos que mandan solos, sin que nadie pulse nada.
 *
 * Es una lista **cerrada** por el mismo motivo que la del motivo del escalado:
 * con texto libre serían mil valores distintos y el filtro por tipo no podría
 * ofrecer ninguno. Lo que llegue y no esté aquí se descarta al leer.
 *
 * `manual` **no está**, y no es un olvido: el despachador lo usan también el
 * chat de Chats y el modo dueño por WhatsApp, que son una persona pulsando y
 * viendo el resultado en su pantalla. Anotarlos llenaría la tabla de ruido y
 * ahogaría justo lo que esta pantalla existe para encontrar.
 */
export const TIPOS_DE_ENVIO = [
    "cobro",
    "desconexion",
    "facturacion",
    "prueba",
    "informe_semanal",
    "ticket",
] as const;

export type TipoDeEnvio = (typeof TIPOS_DE_ENVIO)[number];

/** Cómo se llama cada uno en la pantalla. */
export const NOMBRE_DEL_TIPO: Record<TipoDeEnvio, string> = {
    cobro: "Cobros",
    desconexion: "Desconexión",
    facturacion: "Facturación",
    prueba: "Prueba de 7 días",
    informe_semanal: "Informe semanal",
    ticket: "Ticket resuelto",
};

export const PROVEEDORES = ["evolution", "waha", "meta", "ninguno"] as const;
export type Proveedor = (typeof PROVEEDORES)[number];

/**
 * `ninguno` es un proveedor, y esa es la parte que importa.
 *
 * Cuando no hay ninguna línea conectada el envío **no llega al despachador**,
 * así que sin esta casilla el fallo más silencioso de todos —la cuenta se
 * quedó sin línea y nadie lo sabe— no aparecería en ninguna fila. Un hueco no
 * explica nada; una fila que dice «ninguno · sin línea conectada», sí.
 */
export const NOMBRE_DEL_PROVEEDOR: Record<Proveedor, string> = {
    evolution: "Evolution",
    waha: "Waha",
    meta: "Meta (Cloud API)",
    ninguno: "Sin línea",
};

export function comoTipoDeEnvio(valor: unknown): TipoDeEnvio | null {
    const texto = String(valor ?? "").trim();
    return (TIPOS_DE_ENVIO as readonly string[]).includes(texto)
        ? (texto as TipoDeEnvio)
        : null;
}

export function comoProveedor(valor: unknown): Proveedor | null {
    const texto = String(valor ?? "").trim().toLowerCase();
    return (PROVEEDORES as readonly string[]).includes(texto)
        ? (texto as Proveedor)
        : null;
}

/* ── Una fila ─────────────────────────────────────────────────────────────── */

export type EnvioAutomatico = {
    id: string;
    tipo: TipoDeEnvio;
    proveedor: Proveedor;
    /** La cuenta a la que se le atribuye el envío. Puede no haberla. */
    cuentaId: string | null;
    cuentaNombre: string | null;
    /** La línea por la que salió, tal y como se llama en `Instancias`. */
    linea: string | null;
    destinatario: string | null;
    salio: boolean;
    /** Por qué falló. En un envío bueno es `null`, nunca "ok". */
    motivo: string | null;
    creadoEn: Date;
};

/* ── El resumen por proveedor ─────────────────────────────────────────────── */

export type ResumenDeProveedor = {
    proveedor: Proveedor;
    salieron: number;
    fallaron: number;
    total: number;
    /**
     * Entre 0 y 1, o **`null` cuando no hubo ni un intento**.
     *
     * Es la regla de siempre: *un número que no se puede calcular no se
     * sustituye por otro*. Con cero intentos, un «0 % de fallo» diría que todo
     * va perfecto — que es justo el peor número posible aquí, porque el caso
     * que esta pantalla viene a cazar es **que no salga nada**.
     */
    tasaDeFallo: number | null;
    /** El último que sí salió. `null` si no hay ninguno en la ventana. */
    ultimoBueno: Date | null;
    /** El último intento, saliera o no. Separa «no se usa» de «está roto». */
    ultimoIntento: Date | null;
};

/**
 * Cuántos fallos seguidos hacen falta antes de juzgar una tasa.
 *
 * Con un solo envío y un solo fallo la tasa es del 100 %, y eso no dice nada:
 * una línea que mandó un mensaje en tres días y le rebotó no es una plataforma
 * caída. El aviso tiene que significar algo la primera vez que sale, o se
 * aprende a ignorarlo — que es el fallo del que va medio este documento.
 */
export const MINIMO_PARA_JUZGAR = 5;

/** A partir de aquí la tasa de fallo es noticia. */
export const UMBRAL_DE_FALLO = 0.2;

/** Cuánto puede llevar un proveedor sin un solo acierto antes de avisar. */
export const HORAS_SIN_ACIERTO = 24;

const UNA_HORA = 60 * 60 * 1000;

export function resumirPorProveedor(envios: EnvioAutomatico[]): ResumenDeProveedor[] {
    const porProveedor = new Map<Proveedor, ResumenDeProveedor>();

    for (const envio of envios) {
        const antes = porProveedor.get(envio.proveedor) ?? {
            proveedor: envio.proveedor,
            salieron: 0,
            fallaron: 0,
            total: 0,
            tasaDeFallo: null,
            ultimoBueno: null,
            ultimoIntento: null,
        };

        antes.total += 1;
        if (envio.salio) {
            antes.salieron += 1;
            if (!antes.ultimoBueno || envio.creadoEn > antes.ultimoBueno) {
                antes.ultimoBueno = envio.creadoEn;
            }
        } else {
            antes.fallaron += 1;
        }
        if (!antes.ultimoIntento || envio.creadoEn > antes.ultimoIntento) {
            antes.ultimoIntento = envio.creadoEn;
        }

        porProveedor.set(envio.proveedor, antes);
    }

    return [...porProveedor.values()]
        .map((r) => ({ ...r, tasaDeFallo: r.total > 0 ? r.fallaron / r.total : null }))
        .sort((a, b) => b.total - a.total);
}

/* ── Cuándo hay que mirar ─────────────────────────────────────────────────── */

export type AvisoDeSalud = {
    proveedor: Proveedor;
    clase: "sin_acierto" | "tasa_de_fallo";
    texto: string;
};

/**
 * Los avisos destacados de arriba.
 *
 * **Un proveedor que nadie usa NO está roto**, y esa es la condición que
 * sostiene los dos avisos: los dos exigen que haya habido **intentos**. Sin
 * ella, una plataforma que no tiene ninguna línea Meta vería «Meta lleva más de
 * un día sin un envío correcto» todos los días de su vida, y un aviso que sale
 * siempre se aprende a despachar sin leer — con lo que el día que Waha se caiga
 * de verdad, ese también se ignora.
 *
 * Y son dos avisos distintos a propósito, no uno:
 *
 * - **Sin un solo acierto** es lo que pasó de verdad: Waha rechazaba TODO, así
 *   que la tasa era del 100 % y también lo habría cazado — pero un proveedor
 *   puede estar muerto con pocos intentos, por debajo del mínimo para juzgar
 *   una tasa, y entonces solo este lo ve.
 * - **La tasa de fallo** caza lo contrario: un proveedor que sí manda, con
 *   aciertos recientes, y al que le rebota uno de cada tres. Eso no lo ve el
 *   primero nunca.
 */
export function losAvisosDeSalud(
    resumenes: ResumenDeProveedor[],
    ahora: Date,
): AvisoDeSalud[] {
    const avisos: AvisoDeSalud[] = [];

    for (const r of resumenes) {
        // Un proveedor sin intentos no se juzga: no está roto, está parado.
        if (r.total === 0 || !r.ultimoIntento) continue;

        const desdeElUltimoBueno = r.ultimoBueno
            ? (ahora.getTime() - r.ultimoBueno.getTime()) / UNA_HORA
            : Infinity;

        if (desdeElUltimoBueno > HORAS_SIN_ACIERTO) {
            avisos.push({
                proveedor: r.proveedor,
                clase: "sin_acierto",
                texto: r.ultimoBueno
                    ? `${NOMBRE_DEL_PROVEEDOR[r.proveedor]} lleva ${Math.floor(desdeElUltimoBueno)} h sin un solo envío correcto, y lo ha intentado ${r.total} ${r.total === 1 ? "vez" : "veces"}.`
                    : `${NOMBRE_DEL_PROVEEDOR[r.proveedor]} no ha conseguido enviar NADA: ${r.total} ${r.total === 1 ? "intento" : "intentos"} y ningún acierto.`,
            });
            // Con cero aciertos la tasa es del 100 % y diría lo mismo con otras
            // palabras. Dos avisos para un solo problema es ruido.
            continue;
        }

        if (
            r.total >= MINIMO_PARA_JUZGAR &&
            r.tasaDeFallo !== null &&
            r.tasaDeFallo > UMBRAL_DE_FALLO
        ) {
            avisos.push({
                proveedor: r.proveedor,
                clase: "tasa_de_fallo",
                texto: `${NOMBRE_DEL_PROVEEDOR[r.proveedor]} está fallando el ${Math.round(r.tasaDeFallo * 100)} % de sus envíos (${r.fallaron} de ${r.total}).`,
            });
        }
    }

    return avisos;
}

/* ── Lo que se enseña de un motivo ────────────────────────────────────────── */

/** El tope de lo que se guarda de un motivo de fallo. */
export const TOPE_DEL_MOTIVO = 500;

/**
 * El motivo, saneado y acotado.
 *
 * Vacío es `null` y no cadena vacía: si no, «no se sabe por qué» y «no hubo
 * motivo» serían dos formas de decir lo mismo y la pantalla no podría
 * distinguirlas. Y se recorta porque un `stack` entero de Evolution son
 * kilobytes por fila, multiplicados por cada envío de la plataforma.
 */
export function comoMotivo(valor: unknown): string | null {
    const texto = String(valor ?? "").trim();
    if (!texto) return null;
    return texto.length > TOPE_DEL_MOTIVO ? `${texto.slice(0, TOPE_DEL_MOTIVO - 1)}…` : texto;
}
