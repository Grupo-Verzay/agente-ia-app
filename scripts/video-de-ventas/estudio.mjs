/**
 * El ESTUDIO del vídeo de ventas: la página de 1920×1080 que se graba.
 *
 * Tiene tres pantallas que cuentan la MISMA conversación a la vez:
 *
 *   - el celular del negocio, con WhatsApp;
 *   - WhatsApp Web en una ventana del navegador;
 *   - y un portátil con el PANEL DE VERZAY DE VERDAD dentro —un `<iframe>` de
 *     1440×900 que abre la App servida con `next start`, con sesión, sobre la
 *     base que va escribiendo `backend.mjs`—.
 *
 * Las dos primeras son una recreación: dibujan lo que la historia dice, al
 * mismo tiempo que el backend lo escribe en la base. El portátil no dibuja
 * nada: es la App leyendo lo que lee siempre. Por eso el estudio se sirve en el
 * MISMO origen que la App (`/__estudio/…`, lo intercepta Playwright): la App
 * manda `X-Frame-Options: SAMEORIGIN` y desde otro origen el portátil saldría
 * en blanco.
 *
 * Además: el montaje del arranque (cuatro negocios a la vez y el cierre «y
 * cualquier negocio que venda por WhatsApp»), la tarjeta de la marca, los carteles del tiempo que pasa, los subtítulos de la narración, la
 * capacidad que se está enseñando, los anillos que señalan lo que cambió en el
 * CRM y el cursor.
 *
 * Todo se mueve por PLANOS (`PLANOS`): cada uno dice dónde está y de qué tamaño
 * cada pantalla, y el paso de uno a otro es una transición de CSS. Las cuentas
 * de los planos son puras y están aquí para que el banco las pueda comprobar:
 * ninguna pantalla se sale del cuadro ni pisa los subtítulos.
 */
import { SVG_FLECHA, SVG_MANO, PUNTA } from "../cursor-de-la-guia.mjs";
import { comoDuracion } from "./banda-sonora.mjs";
import { CIERRE_DEL_MONTAJE, LEMA_DE_LA_MARCA, MEDIOS, MEDIOS_DEL_MONTAJE, laHora, lasIniciales } from "./historia.mjs";

/** El cuadro del vídeo. */
export const VISTA = Object.freeze({ ancho: 1920, alto: 1080 });

/** El celular: el marco y, dentro, la pantalla de 390×844 (un iPhone). */
export const TEL = Object.freeze({ ancho: 418, alto: 872, borde: 14, pantalla: { ancho: 390, alto: 844 } });

/** La ventana de WhatsApp Web: la barra del navegador y la App de 1280×800. */
export const WEB = Object.freeze({ ancho: 1280, alto: 838, barra: 38 });

/**
 * El portátil: el bisel, la barra del navegador y la pantalla de la App. La
 * base va aparte, debajo, y no cuenta en el alto.
 */
export const PORTATIL = Object.freeze({
    ancho: 1484,
    alto: 988,
    lado: 22,
    arriba: 26,
    barra: 40,
    pantalla: { ancho: 1440, alto: 900 },
    base: { alto: 24, sobra: 80 },
});

/**
 * Las pestañas del portátil: tres `<iframe>` de la App, uno encima de otro, y
 * se ve uno. Cada pantalla se abre UNA vez y sigue viva debajo —la de Chats
 * con su tiempo real conectado—: cambiar de una a otra es un fundido, no una
 * carga, que en un vídeo se leería como un corte.
 */
export const CAPAS_DEL_PORTATIL = Object.freeze([
    { id: "app", ruta: "/chats" },
    { id: "agenda", ruta: "/schedule" },
    { id: "embudo", ruta: "/embudos" },
]);

/** El dominio que enseña la barra del portátil: el de la plataforma. */
export const DOMINIO_DEL_PANEL = "agente.ia-app.com";

/** La franja de abajo es de los subtítulos: ninguna pantalla baja de aquí. */
export const LIMITE_DE_ABAJO = 1000;
/** Arriba a la izquierda va la capacidad que se enseña: ninguna pantalla sube de aquí. */
export const LIMITE_DE_ARRIBA = 96;

/**
 * Los planos. `s` es la escala; `x`, `y`, la esquina de arriba a la izquierda.
 * Lo que no sale en un plano no está en su objeto.
 */
export const PLANOS = Object.freeze({
    montaje: { montaje: true },
    marca: { marca: true },
    tres: {
        tel: { x: 88, y: 233, s: 0.74 },
        web: { x: 447, y: 337, s: 0.52 },
        portatil: { x: 1163, y: 330, s: 0.45 },
        etiquetas: "abajo",
    },
    telPanel: {
        tel: { x: 110, y: 150, s: 0.93 },
        portatil: { x: 600, y: 145, s: 0.82 },
        etiquetas: "arriba",
    },
    telWeb: {
        tel: { x: 110, y: 150, s: 0.93 },
        web: { x: 560, y: 136, s: 1 },
        etiquetas: "arriba",
    },
    panel: { portatil: { x: 322, y: 118, s: 0.86 } },
    cierre: { cierre: true },
});

/** El tamaño que ocupa una pantalla en el cuadro, a su escala. */
export function laCajaDe(pantalla, { x, y, s }) {
    const base = { tel: TEL, web: WEB, portatil: PORTATIL }[pantalla];
    const extra = pantalla === "portatil" ? PORTATIL.base.alto : 0;
    return {
        x: pantalla === "portatil" ? x - PORTATIL.base.sobra * s : x,
        y,
        w: (base.ancho + (pantalla === "portatil" ? 2 * PORTATIL.base.sobra : 0)) * s,
        h: (base.alto + extra) * s,
    };
}

/**
 * El plano que acerca una zona de la PANTALLA del portátil (coordenadas de la
 * App, 1440×900) al centro del cuadro. Tope de escala 1.6: más allá el panel
 * deja de parecer un panel.
 */
export function enfocar(zona, { tope = 1.6 } = {}) {
    const s = Math.min(tope, 1500 / zona.w, (LIMITE_DE_ABAJO - LIMITE_DE_ARRIBA - 60) / zona.h);
    const cx = zona.x + zona.w / 2;
    const cy = zona.y + zona.h / 2;
    const centroY = (LIMITE_DE_ARRIBA + LIMITE_DE_ABAJO) / 2;
    return {
        portatil: {
            x: Math.round(VISTA.ancho / 2 - s * (PORTATIL.lado + cx)),
            y: Math.round(centroY - s * (PORTATIL.arriba + PORTATIL.barra + cy)),
            s: Math.round(s * 1000) / 1000,
        },
    };
}

/**
 * Un mensaje de la historia como lo pintan el celular y WhatsApp Web: con su
 * hora de la historia, la duración de las notas y los archivos servidos por el
 * estudio (`/__estudio/medios/…`). Puro: el banco comprueba que cada tipo sale
 * con lo que su burbuja necesita. `segundos` son los que midió `medios.mjs`.
 */
export function elMensajeDelEstudio(m, { segundos = {} } = {}) {
    const medio = m.medio ? MEDIOS[m.medio] : null;
    const url = (archivo) => `/__estudio/medios/${archivo}`;
    const base = { id: m.id, de: m.de, tipo: m.tipo, texto: m.texto ?? "", hora: laHora(m.en), ts: m.en };
    if (SEPARADORES[m.id]) base.separador = SEPARADORES[m.id];
    switch (m.tipo) {
        case "nota":
            return { ...base, url: url(medio.archivo), duracion: comoDuracion(segundos[m.medio] ?? 0) };
        case "documento":
            return { ...base, url: url(medio.archivo), nombre: medio.nombre, detalle: `${medio.paginas} páginas · PDF`, portada: url("lista-de-precios.jpg") };
        case "video":
            return { ...base, url: url(medio.archivo), portada: url(medio.portada), duracion: comoDuracion(segundos[m.medio] ?? 9) };
        case "imagen":
            return { ...base, url: url(medio.archivo) };
        default:
            return base;
    }
}

/**
 * Las tarjetas del arranque como las pinta el estudio: cada mensaje con su hora
 * y, si lleva archivo, su dirección servida (`/__estudio/medios/…`); la nota de
 * voz con su duración y el avatar de quien la manda. Puro: el banco comprueba
 * que las cuatro salen con lo que su burbuja necesita.
 */
export function losNegociosDelMontaje(negocios, { hora }) {
    const url = (clave) => {
        const m = MEDIOS_DEL_MONTAJE[clave];
        if (!m) throw new Error(`[estudio] la tarjeta pide un archivo que no existe: ${clave}`);
        return `/__estudio/medios/${m.archivo}`;
    };
    return negocios.map((n) => {
        const iniciales = lasIniciales(n.contacto);
        return {
            id: n.id,
            tipo: n.tipo,
            detalle: n.detalle,
            contacto: n.contacto,
            color: n.color,
            medio: n.medio,
            iniciales,
            mensajes: n.mensajes.map((m, i) => {
                const base = { id: `mini-${n.id}-${i}`, de: m.de, tipo: m.tipo, texto: m.texto ?? "", hora };
                switch (m.tipo) {
                    case "nota":
                        return { ...base, duracion: comoDuracion(m.segundos ?? 0), avatar: { iniciales, color: n.color } };
                    case "documento":
                        return { ...base, nombre: m.nombre, detalle: m.detalle };
                    case "imagen":
                        return { ...base, url: url(m.archivo) };
                    case "video":
                        return { ...base, portada: url(m.archivo), duracion: comoDuracion(m.segundos ?? 0) };
                    default:
                        return base;
                }
            }),
        };
    });
}

/**
 * Dónde empieza un día en la conversación: el primer mensaje y el
 * recordatorio, que llega al día siguiente (el «Hoy» de antes pasa a «Ayer»).
 */
export const SEPARADORES = Object.freeze({ M01: "Hoy", M13: "Hoy" });

/** Un punto de la App (1440×900) en el cuadro, con el portátil en `pos`. */
export function puntoDeLaApp(pos, x, y) {
    return { x: pos.x + pos.s * (PORTATIL.lado + x), y: pos.y + pos.s * (PORTATIL.arriba + PORTATIL.barra + y) };
}

/* ------------------------------------------------------------------ */
/* Los iconos                                                          */
/* ------------------------------------------------------------------ */

const I = {
    atras: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    video: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 10.5l5.5-3v9l-5.5-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    tel: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6.6 3.5l2.6.4 1.2 4.1-2 1.4a12 12 0 006.2 6.2l1.4-2 4.1 1.2.4 2.6c.1.8-.5 1.6-1.4 1.6C10.4 19 5 13.6 5 4.9c0-.9.8-1.5 1.6-1.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0012 0M12 17v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mas: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    camara: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    checks: '<svg viewBox="0 0 18 11" width="17" height="11"><path d="M1 5.8l3.2 3.2L11 2M7.4 8.8l.9.9L15.6 2.4" fill="none" stroke="#53bdeb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
    pausa: '<svg viewBox="0 0 24 24" width="30" height="30"><rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/></svg>',
    pdf: '<svg viewBox="0 0 32 40" width="30" height="38"><path d="M3 1h18l8 8v28a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2z" fill="#e5383b"/><path d="M21 1v6a2 2 0 002 2h6" fill="#ff8a8c"/><text x="15" y="31" text-anchor="middle" font-family="Inter, Arial" font-weight="800" font-size="9" fill="#fff">PDF</text></svg>',
    buscar: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    candado: '<svg viewBox="0 0 24 24" width="13" height="13"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    chats: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3.5a8.5 8.5 0 00-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1012 3.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    estado: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-dasharray="4 2.2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
    canales: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9.5l12-5v15l-12-5z M4 9.5v5M8 15l1.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    comunidad: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5M14.5 14.3c2.6-.4 5 .9 5.8 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    tresPuntos: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="5.5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="18.5" r="1.8" fill="currentColor"/></svg>',
    nuevoChat: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 20l1-4.2L15.8 5a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.2 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7v5.2l3.4 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" width="34" height="34"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    senal: '<svg viewBox="0 0 20 12" width="18" height="11"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="currentColor"/><rect x="5.3" y="5.5" width="3.2" height="6.5" rx="1" fill="currentColor"/><rect x="10.6" y="3" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="15.9" y="0" width="3.2" height="12" rx="1" fill="currentColor"/></svg>',
    wifi: '<svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.5l2.2-2.6a3 3 0 00-4.4 0zM3.4 6.2a6.6 6.6 0 019.2 0l1.4-1.6a8.8 8.8 0 00-12 0zM.4 2.8a11 11 0 0115.2 0" fill="currentColor"/></svg>',
    bateria: '<svg viewBox="0 0 27 13" width="26" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.3" y="2.3" width="19.4" height="8.4" rx="2" fill="currentColor"/><path d="M25 4.5v4a2 2 0 000-4z" fill="currentColor" opacity=".45"/></svg>',
};

/* ------------------------------------------------------------------ */
/* El estilo                                                           */
/* ------------------------------------------------------------------ */

const CSS = `
@font-face { font-family: "Inter"; src: url("/__estudio/fuentes/inter-latin.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1920px; height: 1080px; overflow: hidden; }
body {
  font-family: "Inter", "Noto Color Emoji", system-ui, sans-serif;
  color: #e8edf8;
  background:
    radial-gradient(900px 620px at 12% 8%, rgba(31,123,255,.28), transparent 70%),
    radial-gradient(820px 600px at 92% 96%, rgba(47,214,122,.20), transparent 70%),
    radial-gradient(1200px 900px at 50% 50%, #0b1633 0%, #060a18 100%);
  -webkit-font-smoothing: antialiased;
}
body::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px);
  background-size: 34px 34px;
  mask-image: radial-gradient(1100px 700px at 50% 50%, #000 30%, transparent 85%);
}
.escena { position: absolute; inset: 0; }
.pantalla { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: auto;
  transition: transform 1.15s cubic-bezier(.65,0,.3,1), opacity .7s ease; opacity: 0; }
.pantalla.sale { opacity: 1; }

/* ---------- el celular ---------- */
#tel { width: ${TEL.ancho}px; height: ${TEL.alto}px; border-radius: 64px; background: linear-gradient(145deg,#2b2f3a,#0f1116 55%,#23262e);
  padding: ${TEL.borde}px; box-shadow: 0 0 0 2px #3a3f4b inset, 0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
#tel .vidrio { position: relative; width: 390px; height: 844px; border-radius: 50px; overflow: hidden; background: #fff; color: #111b21; }
#tel .isla { position: absolute; top: 11px; left: 50%; width: 122px; height: 35px; margin-left: -61px; border-radius: 20px; background: #000; z-index: 30; }
#tel .estado { height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 14px 30px 0 44px; font-weight: 600; font-size: 16.5px; color: #000; position: relative; z-index: 5; background: #f6f5f3; }
#tel .estado .iconos { display: flex; gap: 6px; align-items: center; }
#tel .home { position: absolute; bottom: 8px; left: 50%; width: 136px; height: 5px; margin-left: -68px; border-radius: 3px; background: #111; z-index: 30; }
#tel .vista { position: absolute; left: 0; right: 0; top: 50px; bottom: 0; display: flex; flex-direction: column; transition: transform .45s cubic-bezier(.4,0,.2,1), opacity .35s; }
#tel .vista.fuera { transform: translateX(100%); }
#tel .vista.detras { transform: translateX(-28%); opacity: .6; }
#tel .lista { background: #fff; }
#tel .lista .cab { padding: 6px 18px 4px; background: #f6f5f3; }
#tel .lista .cab .fila1 { display: flex; justify-content: space-between; align-items: center; height: 34px; color: #111b21; }
#tel .lista .cab .circ { width: 30px; height: 30px; border-radius: 50%; background: #e9e7e3; display: grid; place-items: center; font-size: 18px; }
#tel .lista .titulo { font-size: 32px; font-weight: 800; letter-spacing: -.5px; margin: 2px 0 8px; }
#tel .lista .busca { height: 36px; border-radius: 10px; background: #ebe9e5; display: flex; align-items: center; gap: 8px; padding: 0 10px; color: #8a8f93; font-size: 16px; }
#tel .lista .chips { display: flex; gap: 8px; padding: 10px 18px 6px; background: #f6f5f3; }
#tel .chip { font-size: 14px; padding: 6px 12px; border-radius: 16px; background: #ebe9e5; color: #54656f; font-weight: 500; }
#tel .chip.on { background: #d9fdd3; color: #0a5e3b; }
#tel .filas { flex: 1; overflow: hidden; }
.fila { display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 76px; position: relative; transition: background .3s; }
.fila .txt { flex: 1; min-width: 0; border-bottom: 1px solid #eceff1; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.fila .l1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.fila .nom { font-size: 17px; font-weight: 600; color: #111b21; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fila .hora { font-size: 13px; color: #667781; flex-shrink: 0; }
.fila .hora.nueva { color: #1daa61; font-weight: 600; }
.fila .l2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 3px; }
.fila .prev { font-size: 15px; color: #667781; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fila .prev.negrita { color: #111b21; font-weight: 500; }
.fila .badge { min-width: 21px; height: 21px; border-radius: 11px; background: #25d366; color: #fff; font-size: 12.5px; font-weight: 700; display: grid; place-items: center; padding: 0 6px; }
.fila.entra { animation: entra .55s cubic-bezier(.2,.8,.2,1); }
.fila.sel { background: #f0f2f5; }
@keyframes entra { from { transform: translateY(-40px); opacity: 0; } to { transform: none; opacity: 1; } }
.avatar { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 18px; flex-shrink: 0; }
#tel .tabs { height: 84px; border-top: 1px solid #e2e2e2; display: flex; justify-content: space-around; padding-top: 8px; background: #f9f9f9; font-size: 11px; color: #54656f; }
#tel .tabs div { display: flex; flex-direction: column; align-items: center; gap: 3px; }
#tel .tabs .on { color: #111b21; font-weight: 700; }
#tel .chat { background: #efeae2; }
#tel .chat .cab { height: 58px; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 6px; background: #f6f5f3; border-bottom: 1px solid #e0ddd8; color: #111b21; }
#tel .chat .cab .avatar { width: 38px; height: 38px; font-size: 14px; }
#tel .chat .cab .quien { flex: 1; min-width: 0; }
#tel .chat .cab .quien b { display: block; font-size: 16.5px; font-weight: 600; }
#tel .chat .cab .quien span { font-size: 12.5px; color: #667781; }
#tel .chat .cab .quien span.vivo { color: #1daa61; }
#tel .chat .cab .acc { display: flex; gap: 18px; color: #111b21; }
.muro { flex: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; padding: 10px 12px;
  background-color: #efeae2;
  background-image: radial-gradient(rgba(0,0,0,.035) 1.2px, transparent 1.4px), radial-gradient(rgba(0,0,0,.03) 1px, transparent 1.2px);
  background-size: 22px 22px, 31px 31px; background-position: 0 0, 11px 14px; }
#tel .pie { height: 94px; background: #f6f5f3; display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px 0; color: #54656f; }
#tel .pie .campo { flex: 1; height: 38px; border-radius: 20px; background: #fff; border: 1px solid #e2e0dc; padding: 0 14px; display: flex; align-items: center; color: #8a8f93; font-size: 16px; }
#tel .pie .icono { width: 38px; height: 38px; display: grid; place-items: center; }
#tel .banner { position: absolute; left: 10px; right: 10px; top: -110px; z-index: 40; border-radius: 22px; padding: 12px 14px; background: rgba(245,245,247,.92);
  backdrop-filter: blur(18px); box-shadow: 0 10px 30px rgba(0,0,0,.18); display: flex; gap: 11px; transition: top .5s cubic-bezier(.2,.9,.25,1.05); color: #111; }
#tel .banner.sale { top: 52px; }
#tel .banner .app { width: 38px; height: 38px; border-radius: 9px; background: #25d366; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
#tel .banner b { font-size: 15px; display: flex; justify-content: space-between; }
#tel .banner b small { font-weight: 400; color: #6b6b70; font-size: 13px; }
#tel .banner p { font-size: 14.5px; margin-top: 2px; }

/* ---------- las burbujas (celular y web) ---------- */
.sep { align-self: center; font-size: 12.5px; background: #fff; color: #54656f; padding: 5px 12px; border-radius: 8px; margin: 6px 0; box-shadow: 0 1px .5px rgba(11,20,26,.13); font-weight: 500; }
.bur { position: relative; max-width: 80%; padding: 6px 8px 7px 9px; border-radius: 9px; font-size: 15.5px; line-height: 1.34; color: #111b21;
  box-shadow: 0 1px .5px rgba(11,20,26,.13); animation: bur .42s cubic-bezier(.2,.9,.3,1.1); word-wrap: break-word; }
@keyframes bur { from { transform: translateY(14px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
.bur.el { align-self: flex-start; background: #fff; border-top-left-radius: 2px; }
.bur.yo { align-self: flex-end; background: #d9fdd3; border-top-right-radius: 2px; }
.bur .meta { float: right; margin: 6px 0 -4px 12px; font-size: 11.5px; color: #667781; display: inline-flex; gap: 3px; align-items: center; }
.bur .meta::after { content: ""; display: block; clear: both; }
.bur .ia { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #1f7bff; margin-bottom: 2px; }
.bur.media { padding: 3px 3px 5px; }
.bur.media img, .bur.media video { display: block; width: 100%; border-radius: 7px; }
.bur.media .cap { padding: 5px 6px 0; }
.bur.media .meta.sobre { position: absolute; right: 9px; bottom: 9px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); margin: 0; }
.bur.media.concap .meta.sobre { position: static; color: #667781; text-shadow: none; float: right; margin: 4px 4px -2px 10px; }
.bur.foto { width: 250px; }
.bur.vid { width: 260px; }
.bur.vid .marco { position: relative; }
.bur.vid .marco .play { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; background: rgba(0,0,0,.5); color: #fff; display: grid; place-items: center; }
.bur.vid .marco .dur { position: absolute; left: 8px; bottom: 7px; color: #fff; font-size: 12px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.6); display: flex; gap: 4px; align-items: center; }
.bur.doc { width: 270px; padding: 3px 3px 5px; }
.bur.doc .prev { height: 120px; border-radius: 7px 7px 0 0; overflow: hidden; background: #fff; }
.bur.doc .prev img { width: 100%; display: block; }
.bur.doc .ficha { display: flex; gap: 10px; align-items: center; padding: 9px 9px; background: rgba(0,0,0,.045); border-radius: 0 0 7px 7px; }
.bur.doc .ficha b { display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 190px; }
.bur.doc .ficha small { font-size: 12px; color: #667781; }
.bur.nota { width: 280px; padding: 8px 10px 6px 8px; }
.nota .fila2 { display: flex; align-items: center; gap: 8px; }
.nota .quien { width: 42px; height: 42px; border-radius: 50%; position: relative; flex-shrink: 0; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 15px; background-size: cover; }
.nota .quien .mic { position: absolute; right: -4px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; display: grid; place-items: center; color: #1daa61; }
.nota .quien .mic svg { width: 12px; height: 12px; }
.nota .boton { color: #54656f; width: 30px; display: grid; place-items: center; }
.nota .onda { position: relative; flex: 1; height: 30px; }
.nota .onda .barras { position: absolute; inset: 0; display: flex; align-items: center; gap: 2px; }
.nota .onda .barras i { flex: 1; border-radius: 2px; background: #b3bcc1; }
.nota .onda .barras.color { clip-path: inset(0 100% 0 0); }
.nota .onda .barras.color i { background: #1daa61; }
.nota.yo .onda .barras.color i { background: #2a8c5a; }
.nota .onda .punto { position: absolute; top: 50%; left: 0; width: 13px; height: 13px; margin: -6.5px 0 0 -6px; border-radius: 50%; background: #1daa61; }
.nota .abajo { display: flex; justify-content: space-between; font-size: 11.5px; color: #667781; margin: 2px 0 0 88px; }
.nota .trans { margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: rgba(0,0,0,.045); font-size: 13.5px; color: #3b4a54; font-style: italic; }

/* ---------- WhatsApp Web ---------- */
#web { width: ${WEB.ancho}px; height: ${WEB.alto}px; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 40px 90px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08); color: #111b21; }
.barraNav { height: ${WEB.barra}px; background: #dfe3ea; display: flex; align-items: center; gap: 14px; padding: 0 14px; }
.semaforo { display: flex; gap: 8px; }
.semaforo i { width: 12px; height: 12px; border-radius: 50%; }
.semaforo i:nth-child(1) { background: #ff5f57; } .semaforo i:nth-child(2) { background: #febc2e; } .semaforo i:nth-child(3) { background: #28c840; }
.url { flex: 0 1 520px; margin: 0 auto; height: 25px; border-radius: 8px; background: #f5f7fa; display: flex; align-items: center; gap: 7px; padding: 0 12px; font-size: 13.5px; color: #3c4043; }
.url svg { color: #5f6368; }
#web .app { display: flex; height: ${WEB.alto - WEB.barra}px; background: #fff; }
#web .riel { width: 64px; background: #f0f2f5; border-right: 1px solid #e0e3e6; display: flex; flex-direction: column; align-items: center; gap: 18px; padding-top: 14px; color: #54656f; }
#web .riel .on { background: #d9dbdf; border-radius: 50%; width: 40px; height: 40px; display: grid; place-items: center; color: #111b21; }
#web .riel .yo { margin-top: auto; margin-bottom: 14px; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; }
#web .col { width: 420px; border-right: 1px solid #e9edef; display: flex; flex-direction: column; }
#web .col .cab { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
#web .col .cab b { font-size: 22px; font-weight: 700; color: #008069; }
#web .col .cab div { display: flex; gap: 20px; color: #54656f; }
#web .col .busca { margin: 0 12px; height: 40px; border-radius: 20px; background: #f0f2f5; display: flex; align-items: center; gap: 12px; padding: 0 14px; color: #667781; font-size: 15px; }
#web .col .chips { display: flex; gap: 8px; padding: 10px 14px; }
#web .col .chip { font-size: 14px; padding: 6px 13px; border-radius: 16px; background: #f0f2f5; color: #54656f; }
#web .col .chip.on { background: #d9fdd3; color: #0a5e3b; font-weight: 500; }
#web .col .filas { flex: 1; overflow: hidden; }
#web .conv { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
#web .conv .cab { height: 60px; background: #f0f2f5; display: flex; align-items: center; gap: 14px; padding: 0 18px; border-left: 1px solid #e0e3e6; }
#web .conv .cab .avatar { width: 40px; height: 40px; font-size: 15px; }
#web .conv .cab .quien { flex: 1; }
#web .conv .cab .quien b { display: block; font-size: 16px; font-weight: 500; }
#web .conv .cab .quien span { font-size: 13px; color: #667781; }
#web .conv .cab .quien span.vivo { color: #1daa61; }
#web .conv .cab .acc { display: flex; gap: 24px; color: #54656f; }
#web .conv .muro { padding: 14px 64px; gap: 3px; }
#web .conv .muro .bur { max-width: 62%; font-size: 14.5px; }
#web .conv .pie { height: 62px; background: #f0f2f5; display: flex; align-items: center; gap: 12px; padding: 0 16px; color: #54656f; }
#web .conv .pie .campo { flex: 1; height: 42px; border-radius: 10px; background: #fff; display: flex; align-items: center; padding: 0 16px; color: #8696a0; font-size: 15px; }
#web .vacio { position: absolute; inset: 0; background: #f0f2f5; display: grid; place-items: center; text-align: center; color: #54656f; transition: opacity .5s; z-index: 3; }
#web .vacio h3 { font-size: 30px; font-weight: 300; color: #41525d; margin: 18px 0 10px; }
#web .vacio p { font-size: 14px; line-height: 1.6; }
#web .vacio.fuera { opacity: 0; pointer-events: none; }

/* ---------- el portátil ---------- */
#portatil { width: ${PORTATIL.ancho}px; height: ${PORTATIL.alto}px; }
#portatil .tapa { position: absolute; inset: 0; border-radius: 26px 26px 10px 10px; background: linear-gradient(180deg,#1b1e25,#0b0d12);
  box-shadow: 0 0 0 2px #2c3039 inset, 0 50px 110px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.07); }
#portatil .cam { position: absolute; top: 10px; left: 50%; width: 7px; height: 7px; margin-left: -3.5px; border-radius: 50%; background: #20242c; box-shadow: 0 0 0 2px #15171c; }
#portatil .pantallaApp { position: absolute; left: ${PORTATIL.lado}px; top: ${PORTATIL.arriba}px; width: ${PORTATIL.pantalla.ancho}px; height: ${PORTATIL.barra + PORTATIL.pantalla.alto}px; background: #fff; overflow: hidden; border-radius: 4px; }
#portatil .barraNav { height: ${PORTATIL.barra}px; background: #e8ebf0; }
#portatil .capas { position: relative; width: ${PORTATIL.pantalla.ancho}px; height: ${PORTATIL.pantalla.alto}px; }
#portatil iframe { position: absolute; left: 0; top: 0; display: block; width: ${PORTATIL.pantalla.ancho}px; height: ${PORTATIL.pantalla.alto}px; border: 0; background: #fff; opacity: 0; transition: opacity .6s ease; }
#portatil iframe.on { opacity: 1; }
#portatil .base { position: absolute; left: -${PORTATIL.base.sobra}px; right: -${PORTATIL.base.sobra}px; top: ${PORTATIL.alto}px; height: ${PORTATIL.base.alto}px;
  border-radius: 0 0 22px 22px; background: linear-gradient(180deg,#c9ced6 0%,#9aa1ac 55%,#6c727d 100%); box-shadow: 0 30px 60px rgba(0,0,0,.45); }
#portatil .base::before { content: ""; position: absolute; top: 0; left: 50%; width: 200px; margin-left: -100px; height: 8px; border-radius: 0 0 10px 10px; background: #868d98; }

/* ---------- las etiquetas de cada pantalla ---------- */
.etiqueta { position: absolute; transform: translateX(-50%); font-size: 17px; font-weight: 600; color: #c9d4ea; letter-spacing: .2px;
  display: flex; align-items: center; gap: 8px; opacity: 0; transition: opacity .6s, left 1.15s cubic-bezier(.65,0,.3,1), top 1.15s cubic-bezier(.65,0,.3,1); white-space: nowrap; }
.etiqueta i { width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg,#1f7bff,#2fd67a); box-shadow: 0 0 10px rgba(47,214,122,.7); }
.etiqueta.sale { opacity: 1; }

/* ---------- el montaje del arranque ---------- */
#montaje { position: absolute; inset: 0; opacity: 0; transition: opacity .8s; }
#montaje.sale { opacity: 1; }
#montaje .titulo { position: absolute; top: 70px; width: 100%; text-align: center; font-size: 42px; font-weight: 800; letter-spacing: -1px; color: #fff; }
#montaje .titulo span { background: linear-gradient(90deg,#4da3ff,#39e08b); -webkit-background-clip: text; background-clip: text; color: transparent; }
#montaje .tarjetas { position: absolute; top: 170px; left: 0; right: 0; display: flex; justify-content: center; align-items: flex-start; gap: 36px; }
.mini { width: 300px; transform: translateY(40px); opacity: 0; transition: transform .8s cubic-bezier(.2,.8,.2,1), opacity .8s; }
.mini.sale { transform: none; opacity: 1; }
.mini > .caja { height: 600px; border-radius: 34px; background: linear-gradient(145deg,#2b2f3a,#0f1116 55%,#23262e); padding: 8px; box-shadow: 0 30px 70px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.06); }
.mini .caja > .pant { height: 100%; border-radius: 26px; overflow: hidden; display: flex; flex-direction: column; background: #efeae2; }
/* El encabezado de un chat de WhatsApp: pegado arriba, gris claro, sin franja de color. */
.mini .cab { height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 7px; padding: 0 12px 0 4px; background: #f6f5f3; border-bottom: 1px solid #e0ddd8; color: #111b21; }
.mini .cab .atras { display: flex; color: #111b21; }
.mini .cab .atras svg { width: 22px; height: 22px; }
.mini .cab .avatar { width: 34px; height: 34px; font-size: 13px; }
.mini .cab .quien { flex: 1; min-width: 0; margin-left: 3px; }
.mini .cab .quien b { display: block; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini .cab .quien span { font-size: 11.5px; color: #667781; }
.mini .cab .acc { display: flex; gap: 16px; align-items: center; color: #111b21; }
.mini .cab .acc svg { width: 20px; height: 20px; }
/* Los mensajes arrancan arriba, como en un chat que empieza. */
.mini .muro { justify-content: flex-start; padding: 10px 9px; }
.mini .pie { height: 46px; flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 0 8px; background: #f6f5f3; color: #54656f; }
.mini .pie svg { width: 19px; height: 19px; display: block; }
.mini .pie .campo { flex: 1; height: 30px; border-radius: 16px; background: #fff; border: 1px solid #e2e0dc; padding: 0 12px; display: flex; align-items: center; color: #8a8f93; font-size: 13px; }
.mini .bur { font-size: 13.5px; max-width: 86%; }
.mini .bur.doc { width: 210px; } .mini .bur.doc .ficha b { max-width: 140px; font-size: 13px; }
.mini .bur.foto { width: 200px; }
.mini .bur.vid { width: 214px; }
.mini .bur.vid .marco .play { width: 44px; height: 44px; margin: -22px 0 0 -22px; }
.mini .bur.vid .marco .play svg { width: 24px; height: 24px; }
.mini .bur.nota { width: 232px; padding: 6px 8px 5px 6px; }
.mini .nota .quien { width: 36px; height: 36px; font-size: 13px; }
.mini .nota .boton { width: 26px; }
.mini .nota .boton svg { width: 24px; height: 24px; }
.mini .nota .onda { height: 26px; }
.mini .nota .abajo { margin-left: 78px; }
.mini .pie2 { text-align: center; margin-top: 18px; font-size: 20px; font-weight: 700; color: #fff; }
.mini .pie2 small { display: block; font-size: 14px; font-weight: 500; color: #9fb0cf; margin-top: 4px; }
/* El cierre del arranque: la quinta columna, después de la cuarta tarjeta. */
.cierreMontaje { width: 330px; height: 600px; display: flex; align-items: center; opacity: 0; transform: translateX(-24px); transition: opacity .7s, transform .9s cubic-bezier(.2,.8,.2,1); }
.cierreMontaje.sale { opacity: 1; transform: none; }
.cierreMontaje div { font-size: 50px; font-weight: 800; letter-spacing: -1.4px; line-height: 1.1; color: #fff; }
.cierreMontaje span { background: linear-gradient(90deg,#4da3ff,#39e08b); -webkit-background-clip: text; background-clip: text; color: transparent; }
.escribiendo { align-self: flex-start; background: #fff; border-radius: 9px; border-top-left-radius: 2px; padding: 10px 12px; display: flex; gap: 4px; box-shadow: 0 1px .5px rgba(11,20,26,.13); }
.escribiendo i { width: 7px; height: 7px; border-radius: 50%; background: #9aa5ab; animation: puntito 1.1s infinite; }
.escribiendo i:nth-child(2) { animation-delay: .15s; } .escribiendo i:nth-child(3) { animation-delay: .3s; }
@keyframes puntito { 0%,60%,100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }

/* ---------- la marca y el cierre ---------- */
.tarjeta { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; opacity: 0; transform: scale(.97); transition: opacity .8s, transform 1.2s cubic-bezier(.2,.8,.2,1); }
.tarjeta.sale { opacity: 1; transform: none; }
.tarjeta .logo { width: 170px; height: 170px; filter: drop-shadow(0 20px 50px rgba(31,123,255,.45)); }
.tarjeta .nombre { font-size: 104px; font-weight: 800; letter-spacing: -3px; margin-top: 10px; background: linear-gradient(90deg,#ffffff 30%,#9cc7ff); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1.05; }
.tarjeta .lema { font-size: 38px; font-weight: 600; color: #dfe7f7; margin-top: 18px; letter-spacing: -.5px; }
.tarjeta .lema span { background: linear-gradient(90deg,#4da3ff,#39e08b); -webkit-background-clip: text; background-clip: text; color: transparent; }
.cta { margin-top: 46px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.cta .boton { padding: 22px 46px; border-radius: 40px; font-size: 30px; font-weight: 700; color: #04121f; background: linear-gradient(90deg,#4da3ff,#39e08b); box-shadow: 0 20px 50px rgba(57,224,139,.3); }
.cta .web { font-size: 22px; color: #9fb0cf; font-weight: 500; }
/* En el flujo, debajo del llamado: abajo del todo lo tapaba el subtítulo del cierre. */
.aviso { margin-top: 30px; font-size: 16px; color: #6d7d9c; }

/* ---------- lo que va encima ---------- */
#capacidad { position: absolute; left: 64px; top: 34px; display: flex; align-items: center; gap: 14px; opacity: 0; transform: translateX(-20px); transition: opacity .5s, transform .6s cubic-bezier(.2,.8,.2,1); pointer-events: none; }
#capacidad.sale { opacity: 1; transform: none; }
#capacidad .num { width: 44px; height: 44px; border-radius: 13px; background: linear-gradient(135deg,#1f7bff,#2fd67a); display: grid; place-items: center; font-size: 20px; font-weight: 800; color: #04121f; }
#capacidad b { font-size: 30px; font-weight: 800; letter-spacing: -.6px; color: #fff; }
#capacidad small { display: block; font-size: 16px; color: #9fb0cf; font-weight: 500; margin-top: 1px; }
#subtitulo { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: 1500px; text-align: center; padding: 11px 26px; border-radius: 16px;
  background: rgba(4,9,22,.78); border: 1px solid rgba(255,255,255,.08); font-size: 25px; font-weight: 600; color: #fff; line-height: 1.32; opacity: 0; transition: opacity .3s; pointer-events: none; }
#subtitulo.sale { opacity: 1; }
#cartel { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4,8,20,.72); backdrop-filter: blur(6px); opacity: 0; transition: opacity .5s; pointer-events: none; z-index: 50; }
#cartel.sale { opacity: 1; }
#cartel .caja { display: flex; flex-direction: column; align-items: center; gap: 14px; transform: scale(.92); transition: transform .7s cubic-bezier(.2,.8,.2,1); }
#cartel.sale .caja { transform: none; }
#cartel .icono { width: 84px; height: 84px; border-radius: 26px; background: linear-gradient(135deg,#1f7bff,#2fd67a); display: grid; place-items: center; color: #04121f; }
#cartel b { font-size: 64px; font-weight: 800; letter-spacing: -1.5px; color: #fff; }
#cartel span { font-size: 26px; color: #b9c6e0; font-weight: 500; }
#anillos { position: absolute; inset: 0; pointer-events: none; z-index: 40; }
.anillo { position: absolute; border-radius: 12px; border: 3px solid #39e08b; box-shadow: 0 0 0 6px rgba(57,224,139,.18), 0 0 26px rgba(57,224,139,.55);
  opacity: 0; transform: scale(1.12); transition: opacity .35s, transform .45s cubic-bezier(.2,.9,.3,1.2); }
.anillo.sale { opacity: 1; transform: none; }
.anillo .txt { position: absolute; left: 50%; bottom: calc(100% + 12px); transform: translateX(-50%); white-space: nowrap; padding: 8px 15px; border-radius: 12px;
  background: linear-gradient(90deg,#1f7bff,#20c36f); color: #fff; font-size: 19px; font-weight: 700; box-shadow: 0 10px 26px rgba(0,0,0,.35); }
.anillo .txt.abajo { bottom: auto; top: calc(100% + 12px); }
#cursor { position: absolute; left: 0; top: 0; z-index: 60; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); opacity: 0; transition: opacity .3s; }
#cursor.sale { opacity: 1; }
#cursor .dib { transform: scale(1.35); transform-origin: 0 0; line-height: 0; }
`;

/* ------------------------------------------------------------------ */
/* El programa del estudio (corre en la página)                        */
/* ------------------------------------------------------------------ */

/**
 * Se pasa como TEXTO a la página (`String(programa)`): no puede usar nada de
 * fuera de su propio cuerpo salvo `DATOS`.
 */
function programa(DATOS) {
    const $ = (s, r = document) => r.querySelector(s);
    const el = (tag, cls, html) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const I = DATOS.iconos;
    const COLORES = ["#6b7cff", "#e76f51", "#2a9d8f", "#f4a261", "#8e5bd8", "#0ea5e9", "#d94c7a"];
    const colorDe = (nombre) => COLORES[[...String(nombre)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];
    const horaCorta = (ms) => new Date(ms).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: DATOS.zona }).replace(/\s?([ap])\.?\s?m\.?/i, (_, a) => ` ${a}. m.`);
    const horaReloj = (ms) => new Date(ms).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: DATOS.zona });

    /* ---------- el reloj del celular ---------- */
    // La hora del celular es la de la historia: el reloj de la página corre,
    // pero un mensaje sellado a las 9:41 no puede llegar a un celular que dice
    // 9:40. Manda la más tardía de las dos.
    let horaDeLaHistoria = 0;
    const pintarReloj = () => {
        const r = $("#tel .estado .hora");
        if (r) r.textContent = horaReloj(Math.max(Date.now(), horaDeLaHistoria));
    };
    setInterval(pintarReloj, 1000);

    /* ---------- las filas de las listas ---------- */
    const filas = { tel: $("#tel .filas"), web: $("#web .col .filas") };
    function unaFila(c, { nueva = false, badge = 0 } = {}) {
        const f = el("div", "fila");
        f.dataset.quien = c.id;
        const prev = c.prev ?? "";
        f.innerHTML =
            `<div class="avatar" style="background:${c.color ?? colorDe(c.nombre)}">${esc(c.iniciales)}</div>` +
            `<div class="txt"><div class="l1"><span class="nom">${esc(c.nombre)}</span><span class="hora${badge ? " nueva" : ""}">${esc(c.hora)}</span></div>` +
            `<div class="l2"><span class="prev${badge ? " negrita" : ""}">${c.yo ? '<span style="display:inline-flex;vertical-align:-1px;margin-right:3px">' + I.checks + "</span>" : ""}${esc(prev)}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</div></div>`;
        if (nueva) f.classList.add("entra");
        return f;
    }
    for (const c of DATOS.otros) {
        filas.tel.appendChild(unaFila(c));
        filas.web.appendChild(unaFila(c));
    }

    /* ---------- las burbujas ---------- */
    const muros = { tel: $("#tel .chat .muro"), web: $("#web .conv .muro") };
    const notas = {};
    const videos = {};
    const ondas = () => {
        // La misma forma de onda en las dos pantallas: sale del id, no del azar.
        const n = 34;
        return Array.from({ length: n }, (_, i) => 18 + Math.round(70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)))).map((h) => `<i style="height:${h}%"></i>`).join("");
    };
    function burbuja(m, donde) {
        const yo = m.de === "ia";
        const lado = yo ? "yo" : "el";
        const meta = `<span class="meta${m.tipo === "imagen" || m.tipo === "video" ? " sobre" : ""}">${esc(m.hora)}${yo ? I.checks : ""}</span>`;
        let b;
        switch (m.tipo) {
            case "texto":
                b = el("div", `bur ${lado}`, `${esc(m.texto)}${meta}`);
                break;
            case "nota": {
                b = el("div", `bur ${lado} nota`);
                const quien = yo
                    ? `<div class="quien" style="background-image:url(${DATOS.logoNegocio})"><span class="mic">${I.mic}</span></div>`
                    : `<div class="quien" style="background:${(m.avatar ?? DATOS.clienta).color}">${esc((m.avatar ?? DATOS.clienta).iniciales)}<span class="mic">${I.mic}</span></div>`;
                const orden = yo ? `${quien}<div class="boton">${I.play}</div>` : `<div class="boton">${I.play}</div>`;
                b.innerHTML =
                    `<div class="fila2">${yo ? orden : quien + orden}<div class="onda"><div class="barras">${ondas()}</div><div class="barras color">${ondas()}</div><div class="punto"></div></div></div>` +
                    `<div class="abajo"><span class="dur">${esc(m.duracion)}</span><span>${esc(m.hora)}${yo ? " " + I.checks : ""}</span></div>`;
                (notas[m.id] ??= []).push(b);
                break;
            }
            case "documento":
                b = el(
                    "div",
                    `bur ${lado} doc`,
                    `${m.portada ? `<div class="prev"><img src="${m.portada}"></div>` : ""}<div class="ficha">${I.pdf}<div style="min-width:0"><b>${esc(m.nombre)}</b><small>${esc(m.detalle)}</small></div></div>` +
                        `<div style="padding:4px 6px 0">${meta}<div style="clear:both"></div></div>`,
                );
                break;
            case "imagen":
                b = el("div", `bur ${lado} media foto${m.texto ? " concap" : ""}`, `<img src="${m.url}">${m.texto ? `<div class="cap">${esc(m.texto)}${meta}</div>` : meta}`);
                break;
            case "video": {
                b = el(
                    "div",
                    `bur ${lado} media vid${m.texto ? " concap" : ""}`,
                    `<div class="marco"><img src="${m.portada}"><div class="play">${I.play}</div><div class="dur">${I.video.replace('width="24" height="24"', 'width="15" height="15"')}${esc(m.duracion)}</div></div>${m.texto ? `<div class="cap">${esc(m.texto)}${meta}</div>` : meta}`,
                );
                (videos[m.id] ??= []).push({ b, m });
                break;
            }
            default:
                b = el("div", `bur ${lado}`, esc(m.texto ?? ""));
        }
        b.dataset.id = m.id;
        return b;
    }

    function previa(m) {
        if (m.tipo === "texto") return m.texto;
        if (m.tipo === "nota") return `🎤 Nota de voz (${m.duracion})`;
        if (m.tipo === "documento") return `📄 ${m.nombre}`;
        if (m.tipo === "imagen") return `📷 ${m.texto || "Foto"}`;
        if (m.tipo === "video") return `🎥 ${m.texto || "Video"}`;
        return "";
    }

    const laura = { id: "laura", nombre: DATOS.clienta.nombreCorto, iniciales: DATOS.clienta.iniciales, color: DATOS.clienta.color };
    let conversacionAbierta = { tel: false, web: false };
    let sinLeer = 0;

    function subirFila(m) {
        for (const donde of ["tel", "web"]) {
            const vieja = filas[donde].querySelector('[data-quien="laura"]');
            if (vieja) vieja.remove();
            const abierta = conversacionAbierta[donde];
            const f = unaFila({ ...laura, hora: m.hora, prev: previa(m), yo: m.de === "ia" }, { nueva: !vieja, badge: abierta || m.de === "ia" ? 0 : sinLeer });
            if (donde === "web" && abierta) f.classList.add("sel");
            filas[donde].prepend(f);
        }
    }

    function separador(texto) {
        for (const donde of ["tel", "web"]) {
            for (const s of muros[donde].querySelectorAll(".sep")) if (s.textContent === "Hoy") s.textContent = "Ayer";
            muros[donde].appendChild(el("div", "sep", esc(texto)));
        }
    }

    /* ---------- el estado de la cabecera ---------- */
    function estado(texto, vivo = false) {
        for (const s of document.querySelectorAll(".estadoLaura")) {
            s.textContent = texto;
            s.classList.toggle("vivo", vivo);
        }
    }
    let quitarEscribiendo = null;
    function escribiendo(tipo) {
        // tipo: "escribiendo" | "grabando" | null
        if (quitarEscribiendo) quitarEscribiendo();
        quitarEscribiendo = null;
        if (!tipo) {
            estado("en línea", false);
            return;
        }
        estado(tipo === "grabando" ? "grabando audio…" : "escribiendo…", true);
    }

    /* ---------- el celular ---------- */
    const tel = {
        banner(m) {
            const b = $("#tel .banner");
            b.querySelector("b").innerHTML = `${esc(DATOS.clienta.nombreCorto)}<small>ahora</small>`;
            b.querySelector("p").textContent = previa(m);
            b.classList.add("sale");
            setTimeout(() => b.classList.remove("sale"), 2600);
        },
        abrir() {
            $("#tel .lista").classList.add("detras");
            $("#tel .chat").classList.remove("fuera");
            conversacionAbierta.tel = true;
        },
    };

    /* ---------- WhatsApp Web ---------- */
    const web = {
        abrir() {
            $("#web .vacio").classList.add("fuera");
            conversacionAbierta.web = true;
            const f = filas.web.querySelector('[data-quien="laura"]');
            if (f) {
                f.classList.add("sel");
                f.querySelector(".badge")?.remove();
                f.querySelector(".hora")?.classList.remove("nueva");
                f.querySelector(".prev")?.classList.remove("negrita");
            }
        },
        reproducirVideo(id, ms) {
            for (const { b, m } of videos[id] ?? []) {
                if (!b.closest("#web")) continue;
                const marco = b.querySelector(".marco");
                const v = document.createElement("video");
                v.src = m.url;
                // Con su portada: mientras decodifica el primer fotograma no
                // queda un hueco en blanco en la burbuja.
                v.poster = m.portada;
                v.muted = true;
                v.playsInline = true;
                v.style.cssText = "display:block;width:100%;border-radius:7px";
                marco.innerHTML = "";
                marco.appendChild(v);
                // Que no reproduzca no puede ser mudo: el vídeo se quedaría en su
                // portada y la grabación saldría con un fotograma fijo sin que
                // nadie supiera por qué.
                v.addEventListener("error", () => console.warn("[estudio] el vídeo no carga:", m.url), { once: true });
                v.play().catch((e) => console.warn("[estudio] el vídeo no arranca:", m.url, String(e)));
                if (ms) setTimeout(() => v.pause(), ms);
            }
        },
    };

    /* ---------- los mensajes ---------- */
    function llega(m) {
        if (m.ts) {
            horaDeLaHistoria = Math.max(horaDeLaHistoria, m.ts);
            pintarReloj();
        }
        if (m.de === "cliente") sinLeer += 1;
        if (m.separador) separador(m.separador);
        for (const donde of ["tel", "web"]) muros[donde].appendChild(burbuja(m, donde));
        subirFila(m);
        if (m.de === "ia") sinLeer = 0;
    }

    function reproducirNota(id, ms, hasta = 1) {
        const pct = Math.round(Math.max(0, Math.min(1, hasta)) * 1000) / 10;
        for (const b of notas[id] ?? []) {
            const color = b.querySelector(".barras.color");
            const punto = b.querySelector(".punto");
            const boton = b.querySelector(".boton");
            boton.innerHTML = I.pausa;
            color.style.transition = `clip-path ${ms}ms linear`;
            punto.style.transition = `left ${ms}ms linear`;
            requestAnimationFrame(() => {
                color.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
                punto.style.left = `${pct}%`;
            });
            setTimeout(() => {
                boton.innerHTML = I.play;
            }, ms);
        }
    }

    /* ---------- los planos ---------- */
    const pantallas = { tel: $("#tel"), web: $("#web"), portatil: $("#portatil") };
    const etiquetas = { tel: $("#etTel"), web: $("#etWeb"), portatil: $("#etPortatil") };
    const TAM = DATOS.tamanos;
    function plano(p, { ms } = {}) {
        for (const k of Object.keys(pantallas)) {
            const e = pantallas[k];
            if (ms != null) e.style.transitionDuration = `${ms}ms, 700ms`;
            const pos = p[k];
            if (pos) {
                e.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${pos.s})`;
                e.classList.add("sale");
                const t = TAM[k];
                const et = etiquetas[k];
                et.style.left = `${pos.x + (t.ancho * pos.s) / 2}px`;
                et.style.top =
                    p.etiquetas === "arriba"
                        ? `${pos.y - 36}px`
                        : `${pos.y + (t.alto + (k === "portatil" ? t.baseAlto : 0)) * pos.s + 16}px`;
                et.classList.toggle("sale", !!p.etiquetas);
            } else {
                e.classList.remove("sale");
                etiquetas[k].classList.remove("sale");
            }
        }
        $("#montaje").classList.toggle("sale", !!p.montaje);
        $("#marca").classList.toggle("sale", !!p.marca);
        $("#cierre").classList.toggle("sale", !!p.cierre);
    }

    /* ---------- el montaje ---------- */
    // Cuándo sale el último mensaje de las tarjetas: el cierre del arranque no
    // puede salir antes, o se leería por delante de la cuarta tarjeta.
    let montajeTermina = 0;
    function montaje() {
        const minis = [...document.querySelectorAll(".mini")];
        minis.forEach((mini, i) => setTimeout(() => mini.classList.add("sale"), 150 + i * 140));
        let ultimo = 0;
        DATOS.montaje.forEach((negocio, i) => {
            const muro = minis[i].querySelector(".muro");
            let t = 700 + i * 380;
            for (const m of negocio.mensajes) {
                const yo = m.de === "ia";
                if (yo) {
                    const escr = el("div", "escribiendo", "<i></i><i></i><i></i>");
                    setTimeout(() => muro.appendChild(escr), t);
                    t += 900;
                    setTimeout(() => escr.remove(), t);
                }
                setTimeout(() => {
                    muro.appendChild(burbuja(m, "mini"));
                    // La nota se escucha: la onda avanza como en el celular.
                    if (m.tipo === "nota") setTimeout(() => reproducirNota(m.id, 2200, 1), 350);
                }, t);
                ultimo = Math.max(ultimo, t);
                t += 800;
            }
        });
        montajeTermina = Date.now() + ultimo + 450;
    }
    /** El cierre del arranque, después de la cuarta tarjeta (nunca antes de su último mensaje). */
    function yCualquierNegocio() {
        const c = $("#montaje .cierreMontaje");
        const falta = Math.max(0, montajeTermina - Date.now());
        setTimeout(() => c.classList.add("sale"), falta);
        return falta;
    }

    /* ---------- lo de encima ---------- */
    function subtitulo(t) {
        const s = $("#subtitulo");
        if (!t) {
            s.classList.remove("sale");
            return;
        }
        s.textContent = t;
        s.classList.add("sale");
    }
    function capacidad(num, titulo, sub) {
        const c = $("#capacidad");
        if (!titulo) {
            c.classList.remove("sale");
            return;
        }
        c.querySelector(".num").textContent = num;
        c.querySelector("b").textContent = titulo;
        c.querySelector("small").textContent = sub ?? "";
        c.classList.remove("sale");
        void c.offsetWidth;
        c.classList.add("sale");
    }
    function cartel(titulo, sub, icono) {
        const c = $("#cartel");
        if (!titulo) {
            c.classList.remove("sale");
            return;
        }
        c.querySelector(".icono").innerHTML = I[icono] ?? I.reloj;
        c.querySelector("b").textContent = titulo;
        c.querySelector("span").textContent = sub ?? "";
        c.classList.add("sale");
    }
    function anillos(lista) {
        const cont = $("#anillos");
        for (const a of [...cont.children]) {
            a.classList.remove("sale");
            setTimeout(() => a.remove(), 400);
        }
        (lista ?? []).forEach((r, i) => {
            const a = el("div", "anillo");
            const pad = r.pad ?? 8;
            Object.assign(a.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + 2 * pad}px`, height: `${r.h + 2 * pad}px` });
            if (r.texto) a.appendChild(el("div", `txt${r.abajo ? " abajo" : ""}`, esc(r.texto)));
            cont.appendChild(a);
            setTimeout(() => a.classList.add("sale"), 60 + i * 180);
        });
    }
    function url(t) {
        $("#portatil .url span").textContent = t;
    }
    /** Cuál de las capas del portátil se ve: un fundido, como cambiar de pestaña. */
    function mostrarApp(id) {
        const capa = DATOS.capas.find((c) => c.id === id);
        if (!capa) throw new Error(`[estudio] el portátil no tiene la capa ${id}`);
        for (const c of DATOS.capas) document.getElementById(c.id).classList.toggle("on", c.id === id);
        url(`${DATOS.dominio}${capa.ruta}`);
    }

    /* ---------- el cursor ---------- */
    const cursor = $("#cursor");
    let pos = { x: 1500, y: 1100 };
    function forma(f) {
        cursor.querySelector(".dib").innerHTML = f === "mano" ? DATOS.cursor.mano : DATOS.cursor.flecha;
        const p = DATOS.cursor.punta[f === "mano" ? "mano" : "flecha"];
        cursor.querySelector(".dib").style.margin = `${-p[1] * 1.35}px 0 0 ${-p[0] * 1.35}px`;
    }
    function moverCursor(x, y, ms = 800) {
        cursor.classList.add("sale");
        cursor.style.transition = `transform ${ms}ms cubic-bezier(.5,.05,.25,1), opacity .3s`;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
        pos = { x, y };
    }
    /**
     * Pulsar no pinta nada encima: es el estándar de las guías (cursor de
     * verdad, sin halo ni círculo). Lo que dice que se pulsó es la mano y lo
     * que pasa en la pantalla.
     */
    function clic() {}
    forma("flecha");
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

    window.__estudio = {
        plano,
        montaje,
        yCualquierNegocio,
        llega,
        separador,
        escribiendo,
        reproducirNota,
        tel,
        web,
        subtitulo,
        capacidad,
        cartel,
        anillos,
        url,
        mostrarApp,
        cursor: { mover: moverCursor, forma, clic, esconder: () => cursor.classList.remove("sale") },
        listo: true,
    };
    window.__rotulo = subtitulo;
    pintarReloj();
}

/* ------------------------------------------------------------------ */
/* La página                                                           */
/* ------------------------------------------------------------------ */

/**
 * El HTML del estudio. `datos` trae lo que el programa necesita: la historia ya
 * con sus horas y sus direcciones (`losDatosDelEstudio`).
 */
export function laPaginaDelEstudio(datos) {
    const D = { ...datos, capas: CAPAS_DEL_PORTATIL, dominio: DOMINIO_DEL_PANEL, iconos: I, cursor: { flecha: SVG_FLECHA, mano: SVG_MANO, punta: PUNTA }, tamanos: { tel: TEL, web: WEB, portatil: { ...PORTATIL, baseAlto: PORTATIL.base.alto } } };
    const e = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const miniaturas = datos.montaje
        .map(
            (n) =>
                `<div class="mini" data-negocio="${e(n.id)}" data-medio="${e(n.medio)}"><div class="caja"><div class="pant">` +
                `<div class="cab"><span class="atras">${I.atras}</span><div class="avatar" style="background:${n.color}">${e(n.iniciales)}</div><div class="quien"><b>${e(n.contacto)}</b><span>en línea</span></div><div class="acc">${I.video}${I.tel}</div></div>` +
                `<div class="muro"></div>` +
                `<div class="pie">${I.mas}<div class="campo">Mensaje</div>${I.camara}${I.mic}</div>` +
                `</div></div><div class="pie2">${e(n.tipo)}<small>${e(n.detalle)}</small></div></div>`,
        )
        .join("");
    // «WhatsApp», al final del cierre, con el degradado de la marca.
    const cierre = e(CIERRE_DEL_MONTAJE).replace(/WhatsApp$/, "<span>WhatsApp</span>");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verzay · video de ventas</title>
<style>${CSS}</style></head><body>
<div class="escena">
  <div id="montaje"><div class="titulo">Tus clientes escriben. <span>La IA responde.</span></div><div class="tarjetas">${miniaturas}<div class="cierreMontaje"><div>${cierre}</div></div></div></div>

  <div id="marca" class="tarjeta">
    <img class="logo" src="${datos.logo}">
    <div class="nombre">Verzay</div>
    <div class="lema">${e(LEMA_DE_LA_MARCA.antes)}<span>${e(LEMA_DE_LA_MARCA.resaltado)}</span>${e(LEMA_DE_LA_MARCA.despues)}</div>
  </div>

  <div id="tel" class="pantalla"><div class="vidrio">
    <div class="isla"></div>
    <div class="estado"><span class="hora">9:41</span><span class="iconos">${I.senal}${I.wifi}${I.bateria}</span></div>
    <div class="banner"><div class="app">${I.chats}</div><div style="flex:1;min-width:0"><b>Laura<small>ahora</small></b><p></p></div></div>
    <div class="vista lista">
      <div class="cab"><div class="fila1"><div class="circ">${I.tresPuntos.replace('width="22" height="22"', 'width="18" height="18"')}</div><div style="display:flex;gap:12px"><div class="circ">${I.camara.replace('width="22" height="22"', 'width="17" height="17"')}</div><div class="circ" style="background:#25d366;color:#fff">${I.mas.replace('width="24" height="24"', 'width="18" height="18"')}</div></div></div>
        <div class="titulo">Chats</div><div class="busca">${I.buscar} Preguntar a Meta AI o buscar</div></div>
      <div class="chips"><span class="chip on">Todos</span><span class="chip">No leídos</span><span class="chip">Favoritos</span><span class="chip">Grupos</span></div>
      <div class="filas"></div>
      <div class="tabs"><div>${I.estado}Novedades</div><div>${I.tel}Llamadas</div><div>${I.comunidad}Comunidades</div><div class="on">${I.chats}Chats</div><div>${I.ajustes}Ajustes</div></div>
    </div>
    <div class="vista chat fuera">
      <div class="cab"><span style="color:#111b21;display:flex">${I.atras}</span><div class="avatar" style="background:${datos.clienta.color}">${e(datos.clienta.iniciales)}</div>
        <div class="quien"><b>${e(datos.clienta.nombreCorto)}</b><span class="estadoLaura">en línea</span></div><div class="acc">${I.video}${I.tel}</div></div>
      <div class="muro"></div>
      <div class="pie"><div class="icono">${I.mas}</div><div class="campo">Mensaje</div><div class="icono">${I.camara}</div><div class="icono">${I.mic}</div></div>
    </div>
    <div class="home"></div>
  </div></div>

  <div id="web" class="pantalla">
    <div class="barraNav"><div class="semaforo"><i></i><i></i><i></i></div><div class="url">${I.candado}<span>web.whatsapp.com</span></div><div style="width:60px"></div></div>
    <div class="app">
      <div class="riel"><div class="on">${I.chats}</div><div>${I.estado}</div><div>${I.canales}</div><div>${I.comunidad}</div><div class="yo"><img src="${datos.logoNegocio}" style="width:100%;height:100%"></div></div>
      <div class="col"><div class="cab"><b>WhatsApp Business</b><div>${I.nuevoChat}${I.tresPuntos}</div></div>
        <div class="busca">${I.buscar} Buscar un chat o iniciar uno nuevo</div>
        <div class="chips"><span class="chip on">Todos</span><span class="chip">No leídos</span><span class="chip">Favoritos</span><span class="chip">Grupos</span></div>
        <div class="filas"></div></div>
      <div class="conv">
        <div class="cab"><div class="avatar" style="background:${datos.clienta.color}">${e(datos.clienta.iniciales)}</div><div class="quien"><b>${e(datos.clienta.nombreCorto)}</b><span class="estadoLaura">en línea</span></div><div class="acc">${I.video}${I.buscar}${I.tresPuntos}</div></div>
        <div class="muro"></div>
        <div class="pie">${I.mas}<div class="campo">Escribe un mensaje</div>${I.mic}</div>
        <div class="vacio"><div><div style="width:120px;height:120px;border-radius:50%;background:#d9fdd3;margin:0 auto;display:grid;place-items:center;color:#1daa61">${I.chats.replace('width="22" height="22"', 'width="60" height="60"')}</div>
          <h3>WhatsApp Business en la web</h3><p>Envía y recibe mensajes desde tu computador.<br>Tus mensajes personales están cifrados de extremo a extremo.</p></div></div>
      </div>
    </div>
  </div>

  <div id="portatil" class="pantalla">
    <div class="tapa"></div><div class="cam"></div>
    <div class="pantallaApp">
      <div class="barraNav"><div class="semaforo"><i></i><i></i><i></i></div><div class="url">${I.candado}<span>${DOMINIO_DEL_PANEL}${CAPAS_DEL_PORTATIL[0].ruta}</span></div><div style="width:60px"></div></div>
      <div class="capas">${CAPAS_DEL_PORTATIL.map((c, i) => `<iframe id="${c.id}" class="${i === 0 ? "on" : ""}" src="about:blank" title="Verzay · ${c.ruta}"></iframe>`).join("")}</div>
    </div>
    <div class="base"></div>
  </div>

  <div id="etTel" class="etiqueta"><i></i>Celular del negocio</div>
  <div id="etWeb" class="etiqueta"><i></i>WhatsApp Web</div>
  <div id="etPortatil" class="etiqueta"><i></i>Panel de Verzay</div>

  <div id="cierre" class="tarjeta">
    <img class="logo" src="${datos.logo}">
    <div class="nombre">Verzay</div>
    <div class="lema">Responde, vende, agenda y hace seguimiento. <span>24/7.</span></div>
    <div class="cta"><div class="boton">Agenda una reunión</div><div class="web">${e(datos.web)}</div></div>
    <div class="aviso">Demostración con datos de ejemplo.</div>
  </div>

  <div id="capacidad"><div class="num">1</div><div><b></b><small></small></div></div>
  <div id="anillos"></div>
  <div id="cartel"><div class="caja"><div class="icono"></div><b></b><span></span></div></div>
  <div id="subtitulo"></div>
  <div id="cursor"><div class="dib"></div></div>
</div>
<script>(${programa.toString()})(${JSON.stringify(D)});</script>
</body></html>`;
}
