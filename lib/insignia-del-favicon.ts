/**
 * El número de pendientes que se pinta sobre el favicon.
 *
 * Con la pestaña de fondo entre otras diez, lo único que se ve de la App es su
 * icono de 16 píxeles. El contador de la barra lateral y la campanita no
 * existen ahí: hay que volver a la pestaña para saber si pasó algo, que es
 * justo lo que no se hace cuando se está en otra cosa.
 *
 * # Qué cuenta, y qué NO
 *
 * **Solo lo que exige respuesta**: chats de clientes sin leer y lo que en el
 * chat del equipo va dirigido a alguien. Las tareas y los avisos de la
 * campanita **no entran**, y esa es la decisión entera: un número que sube por
 * todo se aprende a ignorar, y entonces deja de servir también para lo que sí
 * importaba. Es la misma familia que *la campanita es solo para menciones* y
 * que el sonido del equipo, que no suena con el general a secas.
 *
 * # Y de dónde salen los dos números
 *
 * De lo que **ya corre**, sin un solo sondeo nuevo:
 *
 * | | de dónde | con qué ritmo |
 * | --- | --- | --- |
 * | chats sin leer | `useChatUnreadStore`, que llena la bandeja | en vivo, con el socket |
 * | del equipo | el reloj del contador, que cuelga del layout | 15 s |
 *
 * Un tercer reloj para pintar un número sería una consulta más en todas las
 * pantallas de todo el mundo para no traer ningún dato nuevo.
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

/** La marca de nuestro `<link>`, para no tocar el que pone Next. */
const MARCA = "data-insignia";

export function ponerElIcono(url: string) {
    let link = document.head.querySelector<HTMLLinkElement>(`link[${MARCA}]`);
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.setAttribute(MARCA, "");
        // Al final de `<head>`: entre dos iconos declarados manda el último,
        // así que este gana sin quitar el de Next y quitarlo lo devuelve.
        document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = url;
}

export function quitarElIcono() {
    document.head.querySelector(`link[${MARCA}]`)?.remove();
}

/**
 * El icono de la pestaña, cargado y dibujable.
 *
 * Se prueban **dos** direcciones y el orden importa:
 *
 * 1. El `<link rel="icon">`, que es el icono de verdad — ajustado para verse
 *    a 16 píxeles.
 * 2. El `apple-touch-icon`, que sale de `/api/brand-icon`. Es el respaldo
 *    para el caso que rompe el primero: **el favicon de un reseller vive en
 *    otro dominio**, y sin cabeceras de CORS el navegador lo carga pero
 *    *contamina* el lienzo, así que `toDataURL` lanza y no hay insignia.
 *    Aquél es del MISMO origen siempre, porque lo sirve la propia App.
 *
 * Con `crossOrigin` puesto, una imagen de fuera sin CORS ni siquiera carga
 * —da `error`— en vez de cargar y contaminar. Eso es lo que se quiere: se
 * detecta antes de dibujar y se pasa al respaldo.
 */
export async function elIconoDeLaPestana(): Promise<HTMLImageElement | null> {
    const candidatas = [
        document.head.querySelector<HTMLLinkElement>(`link[rel~="icon"]:not([${MARCA}])`)?.href,
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
        console.info("[insignia] no se pudo dibujar el número sobre el icono", error);
        return null;
    }
}
