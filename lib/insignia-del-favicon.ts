/**
 * El número de pendientes que se pinta sobre el favicon.
 *
 * Con la pestaña de fondo entre otras diez, lo único que se ve de la App es su
 * icono de 16 píxeles. El contador de la barra lateral y la campanita no
 * existen ahí: hay que volver a la pestaña para saber si pasó algo, que es
 * justo lo que no se hace cuando se está en otra cosa.
 *
 * # Qué cuenta, y la corrección del #838
 *
 * **Tres cosas y ninguna más**: las conversaciones SIN LEER de clientes —la
 * pastilla «Sin leer» de Chats, ni una más—, las menciones del chat de equipo
 * y los mensajes directos. Si las tres suman cero, no se pinta nada.
 *
 * Lo que había antes contaba otra cosa y por eso mentía. La mitad de chats
 * salía de `contarChatsSinLeer`, una consulta que contaba **las conversaciones
 * cuyo último mensaje es del contacto**. Eso no es «sin leer»: en una cuenta de
 * 577 chats atendidos son casi todos, así que el icono decía `9+` con la
 * campanita vacía y nada pendiente. Y peor —lo que destapó el #838—: esa
 * consulta mira `chat_conversations`, una tabla que **sobrevive a borrar los
 * leads**, así que con `/chats` vacío y `/sessions` en cero seguía devolviendo
 * un número de tres cifras. Contaba algo que ya no existe.
 *
 * # Por qué la BANDEJA es la única fuente, y qué cuesta
 *
 * Porque **lo no leído de un WhatsApp no vive en nuestra base**, y eso está
 * comprobado, no supuesto:
 *
 * - `chat_conversations` no tiene ninguna columna de «sin leer».
 * - `persistedRowToChat` pone `unreadCount` a 1 solo en Telegram y Meta; para
 *   WhatsApp escribe **0 siempre**.
 * - Lo que la bandeja llama «sin leer» es el `unreadCount` del proveedor
 *   cruzado con las marcas de `seenMessages`, que son de **este navegador**
 *   (`localStorage`, `hooks/chats/useSeenMessages`).
 *
 * Así que el servidor no puede contarlo, y **no se le deja adivinarlo**: un
 * número que no se puede calcular no se sustituye por otro. Quien lo dice es
 * la bandeja y nadie más.
 *
 * Lo que cuesta se dice entero: **hay que haber abierto Chats una vez en esta
 * pestaña.** Mientras no se abra, el número es cero y el icono es el de
 * siempre. Abierta una vez, el número **se queda** al cambiar de pantalla, así
 * que el caso de todos los días —un asesor que trabaja en Chats y se va a
 * Clientes un rato— está cubierto. Se prefiere eso a lo de antes, que era un
 * número grande y falso en todas las pantallas: **un contador que miente es
 * peor que uno que falta**, porque se mira de reojo y se da por bueno.
 *
 * Y NO se persiste en `localStorage`, a propósito. Sería «lo último que supo
 * esta bandeja», que envejece sin avisar: leído el chat desde el móvil, esta
 * pestaña seguiría enseñando el número de ayer. Es exactamente el fallo del
 * que viene esta vuelta.
 *
 * # De dónde sale cada mitad
 *
 * De lo que **ya corre**, sin un solo sondeo nuevo:
 *
 * | | de dónde | con qué ritmo |
 * | --- | --- | --- |
 * | chats sin leer | la bandeja (`useChatUnreadStore`) | en vivo |
 * | del equipo | el reloj del contador, que cuelga del layout | 15 s |
 */

/**
 * A partir de aquí se pinta `9+`.
 *
 * No es estética: el hueco son **16 píxeles de lado** y dentro de ellos la
 * insignia es un círculo de menos de la mitad. Dos cifras ya entran forzadas y
 * tres no se leen — y un número que no se lee es peor que un punto, porque
 * ocupa lo mismo y promete precisión que no da.
 */
export const TOPE_VISIBLE = 9;

/** Un número que llega de un contador y puede ser cualquier cosa. */
function comoCuenta(n: unknown): number {
    const v = typeof n === "number" ? n : Number(n);
    // `NaN`, `Infinity` y los negativos son «no sé», y de «no sé» no se pinta
    // un número: se pinta el icono normal. Inventar un 0 daría lo mismo aquí,
    // pero un `Infinity` colado en la suma la haría `Infinity` entera y
    // taparía los pendientes de verdad del otro contador.
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.floor(v);
}

/**
 * Cuántas conversaciones de clientes están SIN LEER.
 *
 * Lo dice la bandeja y nadie más, y `null` es **«todavía no ha hablado»**: en
 * una pantalla que no sea Chats, o antes de que la lista cargue. De ahí sale
 * cero, que es lo honesto — no se sabe, así que no se pinta.
 *
 * Existe como función y no como un `?? 0` suelto por un motivo concreto:
 * **los tres sitios que pintan este número tienen que decir lo mismo** —la
 * pastilla de «Chats» del menú, la campanita y el icono de la pestaña— y con
 * la regla escrita en cada uno, el día que se afine, dos se quedan atrás. Aquí
 * además se prueba sin levantar nada.
 */
export function losChatsSinLeer(deLaBandeja: number | null | undefined): number {
    if (deLaBandeja == null) return 0;
    return comoCuenta(deLaBandeja);
}

/**
 * Qué se pinta encima del icono.
 *
 * `texto` en `null` significa **el icono normal, sin tocar**. Es lo que se
 * quiere sin pendientes: una insignia con un cero dentro sigue llamando la
 * atención para decir que no pasa nada.
 */
export function loQueSePinta(
    chatsSinLeer: unknown,
    delEquipo: unknown,
): { total: number; texto: string | null } {
    const total = comoCuenta(chatsSinLeer) + comoCuenta(delEquipo);
    if (total <= 0) return { total: 0, texto: null };
    return { total, texto: total > TOPE_VISIBLE ? `${TOPE_VISIBLE}+` : String(total) };
}

/**
 * La geometría de la insignia, en proporción al lado del lienzo.
 *
 * En proporciones y no en píxeles porque el lienzo **no es de 16**: se dibuja
 * a 64 y el navegador lo reduce. Dibujar a 16 da un círculo con los bordes
 * escalonados y un dígito ilegible; dibujar a 64 y dejar que reduzca da un
 * borde limpio, que es lo mismo que hace cualquier icono de la barra.
 */
export const INSIGNIA = {
    /** El lado del lienzo. Cuatro veces lo que se ve, para que reduzca bien. */
    lado: 64,
    /** El radio del círculo. */
    radio: 0.25,
    /**
     * Dónde cae su centro, desde la esquina de abajo a la derecha.
     *
     * `centro + radio + aro` tiene que caber en 1 o la insignia sale CORTADA
     * por la esquina. Un primer intento daba 1,04 y lo cazó el banco: en
     * pantalla se habría visto como un círculo a medias, que es de las cosas
     * que se miran de reojo y se dan por buenas. Por eso el banco lo comprueba
     * como invariante y no como un número escrito a mano.
     */
    centro: 0.68,
    /**
     * El alto de la letra, y va atada al radio a propósito.
     *
     * Son 1,4 veces el radio: con más, el dígito toca el borde del círculo;
     * con menos, a 16 píxeles no se lee. Si se cambia el radio hay que
     * recalcular esto, no dejarlo donde estaba.
     */
    letra: 0.35,
    /** Un aro del color del fondo, para que despegue del icono de debajo. */
    aro: 0.05,
} as const;

/**
 * Los colores. Rojo porque es lo que se lee como «atiéndeme» en una pestaña
 * sin mirarla, y el mismo que ya usan los contadores de la App.
 */
export const COLORES_DE_LA_INSIGNIA = {
    fondo: "#ef4444",
    texto: "#ffffff",
    /** El aro que la separa del icono. Blanco, que es el fondo de una pestaña. */
    aro: "#ffffff",
} as const;

// ── Y lo que toca el DOM ────────────────────────────────────────────────────
//
// Vive AQUÍ y no dentro del componente para que el banco del navegador pueda
// ejercer exactamente este código. Escrito en el componente habría que
// copiarlo al banco, y entonces lo que se prueba es la copia.

/** La marca de nuestro `<link>`, para distinguirlo de los del documento. */
export const MARCA = "data-insignia";

/**
 * Los iconos que declaró el documento se APARTAN mientras manda la insignia —
 * y apartar NO es sacarlos del `<head>`.
 *
 * **Añadir el nuestro al final no bastaba, y ese era el fallo 3 del #838.** El
 * layout declara TRES (`/favicon-48.png`, `/icon-192.png`, `/icon-512.png`)
 * más los que Next emite por convención de fichero, todos con su `sizes`. Con
 * varios candidatos el navegador **elige**, y elige por tamaño y tipo, no por
 * orden. La única forma de que no lo pise nadie es que no haya ningún otro
 * `rel="icon"`.
 *
 * # Y la primera forma de apartarlos rompía la navegación entera
 *
 * El #838 los apartaba con `link.remove()`. **Esos `<link>` no son nuestros:
 * son de React** —Next pinta los `icons` del `generateMetadata` del layout como
 * elementos *hoistables*— y React 19 los desmonta así:
 *
 * ```js
 * function unmountHoistable(instance) { instance.parentNode.removeChild(instance); }
 * ```
 *
 * Con el nodo fuera del documento `parentNode` es `null`, y cada navegación que
 * rehacía el `<head>` reventaba con **«Cannot read properties of null (reading
 * 'removeChild')»**: la transición se abortaba —la pestaña se quedaba en la
 * pantalla de antes— y salía «No se pudo cargar la pantalla». Y **volvía al
 * recargar**, porque en cuanto hay un pendiente la insignia se vuelve a poner.
 * Se vio en /panel porque ahí se salta de pestaña en pestaña y el
 * superadministrador casi siempre tiene algo pendiente.
 *
 * > **Un nodo que pinta React no se saca del DOM desde fuera.** Se apartan
 * > cambiándoles el `rel` —queda guardado en `RELACION_ORIGINAL`— y se
 * > devuelven poniéndoselo otra vez. El nodo sigue en su sitio, así que cuando
 * > React lo desmonta su `parentNode` es el `<head>` y no pasa nada.
 *
 * `apple-touch-icon` NO se aparta —es otro `rel`, lo usa iOS y además es
 * nuestro respaldo para leer el icono de base—.
 */
export const RELACION_ORIGINAL = "data-insignia-rel";

/** El `rel` que llevan mientras están apartados: no es un icono para nadie. */
const REL_APARTADO = "x-icono-apartado";

/**
 * El vigilante del `<head>`.
 *
 * Next puede volver a meter sus `<link rel="icon">` al navegar entre rutas, y
 * entonces volvería a ganar el suyo sin que nadie lo note — el icono se
 * quedaría limpio a mitad de sesión y no habría forma de explicarlo. Se vuelven
 * a apartar en cuanto aparecen.
 *
 * No hay bucle: observa `childList` y apartar solo cambia un atributo, que no
 * es un cambio de hijos.
 */
let vigilante: MutationObserver | null = null;

/** Los `<link rel="icon">` del documento que no son el nuestro. */
function losDelDocumento(): HTMLLinkElement[] {
    // `rel~="icon"` es coincidencia por PALABRA, así que coge `shortcut icon`
    // y deja fuera `apple-touch-icon` y `mask-icon`, que es justo lo que hace
    // falta.
    return Array.from(
        document.head.querySelectorAll<HTMLLinkElement>(`link[rel~="icon"]:not([${MARCA}])`),
    );
}

/** Los que están apartados ahora mismo, siguen en el `<head>`. */
function losApartados(): HTMLLinkElement[] {
    return Array.from(
        document.head.querySelectorAll<HTMLLinkElement>(`link[${RELACION_ORIGINAL}]`),
    );
}

function apartarLosOtros() {
    for (const link of losDelDocumento()) {
        link.setAttribute(RELACION_ORIGINAL, link.getAttribute("rel") ?? "icon");
        link.setAttribute("rel", REL_APARTADO);
    }
}

function devolverLosOtros() {
    // Solo los que siguen en el `<head>`: los que React desmontó mientras
    // estaban apartados ya no son de nadie, y volver a meterlos sería pintar
    // un icono de una pantalla que ya no está.
    for (const link of losApartados()) {
        link.setAttribute("rel", link.getAttribute(RELACION_ORIGINAL) || "icon");
        link.removeAttribute(RELACION_ORIGINAL);
    }
}

function vigilarElHead() {
    if (vigilante || typeof MutationObserver === "undefined") return;
    vigilante = new MutationObserver(() => {
        // Si ya no hay insignia no hay nada que defender: el que la quita
        // desconecta, y esto es solo la red de seguridad de una carrera.
        if (!document.head.querySelector(`link[${MARCA}]`)) return;
        apartarLosOtros();
    });
    vigilante.observe(document.head, { childList: true });
}

export function ponerElIcono(url: string) {
    apartarLosOtros();
    // El `<link>` se REHACE en cada número en vez de cambiarle el `href`.
    // Cambiar el atributo a secas no siempre hace que el navegador vuelva a
    // leer el icono; sustituir el nodo sí, y esto ocurre una vez por cada
    // cambio de número, que es poquísimas veces.
    document.head.querySelector(`link[${MARCA}]`)?.remove();
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute(MARCA, "");
    link.href = url;
    document.head.appendChild(link);
    vigilarElHead();
}

export function quitarElIcono() {
    // Primero se calla el vigilante: lo siguiente es AÑADIR nodos, y es lo
    // único que podría hacerle morderse la cola.
    vigilante?.disconnect();
    vigilante = null;
    document.head.querySelector(`link[${MARCA}]`)?.remove();
    devolverLosOtros();
}

/**
 * El icono de la pestaña, cargado y dibujable.
 *
 * Se prueban **tres** sitios y el orden importa:
 *
 * 1. Los `<link rel="icon">` que siguen en el `<head>`.
 * 2. Los que esta misma función APARTÓ (`losApartados`). Sin esta mitad, el
 *    segundo número de una sesión no encontraría ningún icono de base —los
 *    acabamos de quitar nosotros— y la insignia dejaría de dibujarse sola.
 * 3. El `apple-touch-icon`, que sale de `/api/brand-icon`. Es el respaldo para
 *    el caso que rompe a los otros dos: **el favicon de un reseller vive en
 *    otro dominio**, y sin cabeceras de CORS el navegador lo carga pero
 *    *contamina* el lienzo, así que `toDataURL` lanza y no hay insignia. Aquél
 *    es del MISMO origen siempre, porque lo sirve la propia App.
 *
 * Con `crossOrigin` puesto, una imagen de fuera sin CORS ni siquiera carga
 * —da `error`— en vez de cargar y contaminar. Eso es lo que se quiere: se
 * detecta antes de dibujar y se pasa al respaldo.
 */
export async function elIconoDeLaPestana(): Promise<HTMLImageElement | null> {
    const candidatas = [
        ...losDelDocumento().map((l) => l.href),
        ...losApartados().map((l) => l.href),
        document.head.querySelector<HTMLLinkElement>('link[rel~="apple-touch-icon"]')?.href,
    ].filter((h): h is string => Boolean(h));

    for (const href of candidatas) {
        const img = await cargar(href);
        if (img) return img;
    }
    return null;
}

function cargar(href: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = href;
    });
}

/**
 * El icono con el número encima, como `data:` para el `<link>`.
 *
 * Se dibuja a `INSIGNIA.lado` y no a 16: a 16 el círculo sale con los bordes
 * escalonados y el dígito ilegible. El navegador lo reduce él, que es lo que
 * hace con cualquier icono de la barra.
 */
export function dibujarLaInsignia(icono: HTMLImageElement, texto: string): string | null {
    try {
        const lado = INSIGNIA.lado;
        const lienzo = document.createElement("canvas");
        lienzo.width = lado;
        lienzo.height = lado;
        const g = lienzo.getContext("2d");
        if (!g) return null;

        g.drawImage(icono, 0, 0, lado, lado);

        const cx = lado * INSIGNIA.centro;
        const cy = lado * INSIGNIA.centro;
        const r = lado * INSIGNIA.radio;

        // El aro primero y el círculo encima: así la insignia despega del
        // icono de debajo en vez de confundirse con él.
        g.beginPath();
        g.arc(cx, cy, r + lado * INSIGNIA.aro, 0, Math.PI * 2);
        g.fillStyle = COLORES_DE_LA_INSIGNIA.aro;
        g.fill();

        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = COLORES_DE_LA_INSIGNIA.fondo;
        g.fill();

        g.fillStyle = COLORES_DE_LA_INSIGNIA.texto;
        g.font = `bold ${Math.round(lado * INSIGNIA.letra)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        // `9+` es más ancho que un dígito: si se sale del círculo se aprieta,
        // en vez de recortarlo o dejarlo asomar por los lados.
        const ancho = g.measureText(texto).width;
        const cabe = r * 1.7;
        if (ancho > cabe) {
            g.save();
            g.translate(cx, cy);
            g.scale(cabe / ancho, 1);
            g.fillText(texto, 0, 0);
            g.restore();
        } else {
            g.fillText(texto, cx, cy);
        }

        return lienzo.toDataURL("image/png");
    } catch (error) {
        // `toDataURL` lanza con el lienzo contaminado por una imagen de otro
        // origen. Se queda el icono normal, que es lo de antes.
        console.info("[insignia] no se pudo dibujar el numero sobre el icono", error);
        return null;
    }
}
