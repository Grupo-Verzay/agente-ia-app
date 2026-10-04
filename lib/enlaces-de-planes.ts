/**
 * Las direcciones de los planes: por NIVEL, y sin la modalidad a la vista.
 *
 * Dos fallos que se veían en la barra del navegador y que salen de aquí:
 *
 *   1. La página de un plan y el registro llevaban el nombre INTERNO del plan
 *      (`/planes/basico`, `?plan=avanzado`), que se lee como un nombre
 *      comercial —y no es el que el cliente ve: `avanzado` se vende como
 *      «Esencial»—. El nivel (1 a 6) no cambia nunca, así que es lo único que
 *      puede ir en una dirección: `/planes/nivel-2`, `?plan=nivel-2`. El nombre
 *      comercial se queda en la PANTALLA.
 *   2. La modalidad viajaba a la vista (`?tipo=HUMANO`, `&a=HUMANO`). Ahora
 *      viaja en una cookie de primera parte (`COOKIE_DE_ASISTENCIA`): la pone
 *      quien elige —la pestaña IA/Humano de la landing, la página del plan,
 *      el panel— y la leen el servidor de la página del plan y el registro.
 *      Y quien la lee NO se la cree a ciegas: la modalidad pedida solo vale si
 *      está a la venta en ese nivel (`laAsistenciaQueSeVende`).
 *
 * Los enlaces viejos siguen funcionando: el middleware convierte la dirección
 * a su forma limpia (`laDireccionLimpiaDelPlan`) y, si traía la modalidad, la
 * guarda en la cookie antes de redirigir. Es también como viaja la modalidad
 * cuando la landing está incrustada en otra web: ahí una cookie puesta desde
 * el marco es de un tercero, así que el enlace que abre otra pestaña la lleva
 * en la dirección y el middleware la pasa a la cookie, ya de primera parte.
 *
 * Puro y SIN imports: lo usa el middleware (edge, sin Prisma), los componentes
 * del navegador y el banco. Por eso la lista de niveles va escrita aquí; el
 * banco comprueba que es exactamente `PLANS`.
 */

export const NIVELES_DE_PLAN = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"] as const;

export type NivelDePlan = (typeof NIVELES_DE_PLAN)[number];
export type Asistencia = "IA" | "HUMANO";

/** La cookie donde viaja la modalidad elegida. Nunca decide sola: ver `laAsistenciaQueSeVende`. */
export const COOKIE_DE_ASISTENCIA = "plan_asistencia";

/** Lo que dura la elección: lo que se tarda, con calma, en pasar de mirar un plan a registrarse. */
export const DURACION_DE_LA_COOKIE_S = 60 * 60 * 24 * 7;

/**
 * El nivel interno de lo que llega en una dirección: `nivel-2`, `nivel2`,
 * `nivel 2`, `2` o el nombre interno (`basico`, de los enlaces que ya
 * circulan). Es la misma regla que `normalizarPlan`, sin depender de Prisma.
 */
export function elNivelDelSlug(valor: string | null | undefined): NivelDePlan | null {
    const slug = valor?.trim().toLowerCase();
    if (!slug) return null;
    const porNivel = slug.match(/^(?:nivel[\s_-]*)?(\d+)$/);
    if (porNivel) {
        const n = Number(porNivel[1]);
        return n >= 1 && n <= NIVELES_DE_PLAN.length ? NIVELES_DE_PLAN[n - 1] : null;
    }
    return (NIVELES_DE_PLAN as readonly string[]).includes(slug) ? (slug as NivelDePlan) : null;
}

/** `nivel-N` del plan, o `null` si no es un nivel. Lo que va en TODA dirección de un plan. */
export function elSlugDelNivel(plan: string | null | undefined): string | null {
    const nivel = elNivelDelSlug(plan);
    return nivel ? `nivel-${NIVELES_DE_PLAN.indexOf(nivel) + 1}` : null;
}

/**
 * `IA` o `HUMANO` de lo que llega de fuera, o `null` si no es ninguna de las
 * dos. Estricta a propósito: `normalizarAsistencia` convierte cualquier cosa en
 * IA, y aquí «no sé» tiene que distinguirse de «IA» para no pisar una cookie
 * buena con basura.
 */
export function comoAsistencia(valor: unknown): Asistencia | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toUpperCase();
    return v === "IA" || v === "HUMANO" ? v : null;
}

/**
 * La página pública de un plan: `/planes/nivel-N`. Sin la modalidad: esa la
 * dice la cookie. `asistenciaQueViaja` solo para el enlace que sale de la
 * landing INCRUSTADA hacia otra pestaña, donde la cookie no llega; el
 * middleware la quita de la dirección en cuanto llega.
 */
export function elEnlaceDeLaPaginaDelPlan(plan: string, asistenciaQueViaja?: Asistencia | null): string {
    const base = `/planes/${elSlugDelNivel(plan) ?? encodeURIComponent(plan)}`;
    return asistenciaQueViaja ? `${base}?tipo=${asistenciaQueViaja}` : base;
}

/**
 * El registro con un plan marcado: `/register?plan=nivel-N` (y `r=` si es la
 * landing de un reseller). Sin la modalidad, por lo mismo. `asistenciaQueViaja`,
 * solo dentro de la landing incrustada (ver arriba).
 */
export function elEnlaceDeRegistro(
    plan: string,
    { r, asistenciaQueViaja }: { r?: string | null; asistenciaQueViaja?: Asistencia | null } = {},
): string {
    const params = new URLSearchParams();
    if (r) params.set("r", r);
    params.set("plan", elSlugDelNivel(plan) ?? plan);
    if (asistenciaQueViaja) params.set("a", asistenciaQueViaja);
    return `/register?${params.toString()}`;
}

/**
 * La cabecera `Set-Cookie` de la modalidad. `entreSitios`: la página va
 * dentro de un marco de otra web, donde una cookie `Lax` no vuelve; ahí va
 * `SameSite=None; Secure; Partitioned`, que solo vive dentro de ese marco.
 */
export function laCookieDeAsistencia(tipo: Asistencia, { entreSitios = false }: { entreSitios?: boolean } = {}): string {
    const partes = [
        `${COOKIE_DE_ASISTENCIA}=${tipo}`,
        "Path=/",
        `Max-Age=${DURACION_DE_LA_COOKIE_S}`,
        entreSitios ? "SameSite=None" : "SameSite=Lax",
    ];
    if (entreSitios) partes.push("Secure", "Partitioned");
    return partes.join("; ");
}

/**
 * Apunta en el navegador la modalidad que se acaba de elegir. Nunca lanza: una
 * cookie bloqueada no puede romper un clic, y si no queda puesta el servidor
 * cae en la modalidad que esté a la venta.
 */
export function recordarLaAsistencia(tipo: string | null | undefined, opciones?: { entreSitios?: boolean }): void {
    const valida = comoAsistencia(tipo);
    if (!valida || typeof document === "undefined") return;
    try {
        document.cookie = laCookieDeAsistencia(valida, opciones);
    } catch (e) {
        console.warn("[planes] no se pudo apuntar la modalidad elegida; se usa la que esté a la venta", e);
    }
}

/** ¿La página está dentro de un marco de otra web? Solo el navegador lo sabe. */
export function estaEnUnMarco(): boolean {
    try {
        return typeof window !== "undefined" && window.self !== window.top;
    } catch {
        // Leer `top` de otro origen lanza: eso ya dice que hay un marco.
        return true;
    }
}

/**
 * La forma limpia de una dirección de planes, o `null` si ya lo está (o no es
 * de planes). La usa el middleware antes de servir la página.
 *
 *   - `/planes/<plan>`: el plan pasa a `nivel-N`; un plan que no existe se deja
 *     como está (la página contesta 404).
 *   - `/register` y `/completar-registro`: `?plan=` pasa a `nivel-N`.
 *   - En las tres: `a=` se quita siempre, y `tipo=` solo si es IA o Humano
 *     —`tipo=reseller` es otra cosa (el registro de un reseller) y se queda—.
 *     La modalidad que traían, si era válida, sale en `asistencia` para que el
 *     middleware la guarde en la cookie.
 *
 * Lo demás de la dirección (reseller, afiliado, objetivo…) no se toca.
 */
export function laDireccionLimpiaDelPlan(
    pathname: string,
    query: URLSearchParams,
): { destino: string; asistencia: Asistencia | null } | null {
    let ruta = pathname;
    const params = new URLSearchParams(query.toString());
    let cambio = false;

    const deLaPagina = pathname.match(/^\/planes\/([^/]+)\/?$/);
    const delRegistro = pathname === "/register" || pathname === "/completar-registro";
    if (!deLaPagina && !delRegistro) return null;

    if (deLaPagina) {
        let crudo = deLaPagina[1];
        try {
            crudo = decodeURIComponent(crudo);
        } catch {
            // Una codificación rota no es un plan: se deja y la página dice 404.
        }
        const slug = elSlugDelNivel(crudo);
        if (slug && slug !== deLaPagina[1]) {
            ruta = `/planes/${slug}`;
            cambio = true;
        }
    } else {
        const plan = params.get("plan");
        const slug = elSlugDelNivel(plan);
        if (plan !== null && slug && slug !== plan) {
            params.set("plan", slug);
            cambio = true;
        }
    }

    let asistencia: Asistencia | null = null;
    if (params.has("a")) {
        asistencia = comoAsistencia(params.get("a"));
        params.delete("a");
        cambio = true;
    }
    const tipo = params.get("tipo");
    const tipoDeAsistencia = comoAsistencia(tipo);
    if (tipoDeAsistencia) {
        asistencia = tipoDeAsistencia;
        params.delete("tipo");
        cambio = true;
    }

    if (!cambio) return null;
    const resto = params.toString();
    return { destino: resto ? `${ruta}?${resto}` : ruta, asistencia };
}

/**
 * La modalidad con la que se vende un nivel, de la que se pidió y las que
 * están a la venta. La cookie dice lo que el cliente ELIGIÓ, pero puede venir
 * de otra visita, de otro nivel o faltar: solo vale si ese nivel se vende así.
 * Si no, la que se venda (IA primero, que es la pestaña con la que abre la
 * landing). Sin ninguna a la venta, lo pedido o IA, que es lo de siempre.
 */
export function elegirLaAsistencia(pedida: Asistencia | null, aLaVenta: ReadonlySet<Asistencia>): Asistencia {
    if (pedida && aLaVenta.has(pedida)) return pedida;
    if (aLaVenta.has("IA")) return "IA";
    if (aLaVenta.has("HUMANO")) return "HUMANO";
    return pedida ?? "IA";
}
