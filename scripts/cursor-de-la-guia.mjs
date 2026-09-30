/**
 * El CURSOR que se ve en el vídeo de la guía.
 *
 * Chromium sin cabeza no pinta el puntero en la grabación, así que hay que
 * dibujarlo. Se dibuja como el de verdad y NADA más:
 *
 *   - la FLECHA de siempre al moverse;
 *   - la MANITO sobre lo que se puede pulsar (botones, enlaces, interruptores,
 *     casillas, pestañas, opciones de un menú), que es lo que hace el
 *     navegador y por eso sale justo antes y durante el clic;
 *   - la «I» de texto sobre un campo donde se escribe, como en el navegador.
 *
 * Sin halo, sin círculo, sin encogerse al pulsar: el vídeo ya lleva narración,
 * y un cursor adornado se lee como otra marca encima de la pantalla.
 *
 * Qué forma toca se decide con lo que el propio navegador pintaría —el
 * `cursor` calculado del elemento que queda bajo la punta— y, de respaldo, con
 * el tipo de elemento: un botón de shadcn no siempre declara `cursor:pointer`
 * y el navegador de verdad sí enseña la manito ahí. Se vuelve a mirar cada
 * poco aunque el ratón no se mueva: un diálogo que se abre debajo cambia lo
 * que hay bajo la punta.
 *
 * El estado queda en `data-cursor-de-la-guia` del `<html>` para que el banco
 * lo pueda leer.
 *
 * # Y a PANTALLA COMPLETA, dentro del elemento que la ocupa
 *
 * El elemento a pantalla completa se pinta en la capa de arriba del todo, por
 * encima de cualquier `z-index` del resto del documento: el cursor y el
 * rótulo, colgados del `<body>`, se quedaban debajo y desaparecían del vídeo
 * mientras durara (el botón de pantalla completa del Copiloto). Se mudan
 * dentro de ese elemento al entrar y vuelven al `<body>` al salir
 * (`fullscreenchange`).
 */

/** La flecha de Windows: blanca con borde negro, la punta en (0,0). */
export const SVG_FLECHA = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30"><path d="M1.5 1.5 L1.5 23 L6.6 18.2 L10 26.4 L13.6 24.9 L10.3 16.9 L17.4 16.9 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** La manito que señala: la punta del índice arriba, en (8,1). */
export const SVG_MANO = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="28" viewBox="0 0 24 28"><path d="M8 1.2c-1.1 0-2 .9-2 2v10.3l-1.5-1.5c-.8-.8-2.1-.8-2.9 0-.8.8-.8 2 0 2.8l5.6 6.8c1.4 1.7 3.4 2.6 5.5 2.6h3.2c3.6 0 6.4-2.9 6.4-6.4v-5.9c0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8v-.8c0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8v-.6c0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8V3.2c0-1.1-.9-2-2-2z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/><path d="M13.2 12.6v4.6M16.8 13v4.2M20.4 13.8v3.4" stroke="#000" stroke-width="1.1" stroke-linecap="round"/></svg>`;

/** La «I» de texto de un campo. */
export const SVG_TEXTO = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="24" viewBox="0 0 14 24"><path d="M3 2h3l1 1 1-1h3M7 3v18M3 22h3l1-1 1 1h3" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M3 2h3l1 1 1-1h3M7 3v18M3 22h3l1-1 1 1h3" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round"/></svg>`;

/** Dónde queda la punta de cada dibujo: se resta para que la punta sea el punto del ratón. */
export const PUNTA = { flecha: [1.5, 1.5], mano: [8, 1.2], texto: [7, 12] };

const CLICABLE =
    'a[href],button,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="menuitemcheckbox"],[role="option"],[role="tab"],[role="link"],select,summary,label,input[type="checkbox"],input[type="radio"],input[type="button"],input[type="submit"],input[type="file"]';
const ESCRIBIBLE =
    'textarea,[contenteditable=""],[contenteditable="true"],input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="tel"],input[type="number"],input[type="password"],input[type="url"]';

/** Lo que se inyecta en la página (`addInitScript`). */
export const CURSOR = `
(() => {
  if (window.__cursor) return;
  const CLICABLE = ${JSON.stringify(CLICABLE)};
  const ESCRIBIBLE = ${JSON.stringify(ESCRIBIBLE)};
  const formaEn = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'flecha';
    const desactivado = el.closest('[disabled],[aria-disabled="true"]');
    if (el.closest(ESCRIBIBLE) && !desactivado) return 'texto';
    const css = getComputedStyle(el).cursor;
    if (css === 'pointer') return 'mano';
    if (css === 'text') return 'texto';
    if (el.closest(CLICABLE) && !desactivado) return 'mano';
    return 'flecha';
  };
  // Dentro de un IFRAME (la hoja incrustada de Google Sheets) el ratón se
  // mueve en OTRO documento: la página de arriba deja de recibir sus
  // mousemove, así que su cursor se quedaría clavado en el borde y este marco
  // pintaría otro. En un marco no se dibuja nada: se le cuenta a la página de
  // arriba dónde está la punta y qué forma toca, y la pinta ella.
  if (window.top !== window) {
    let fx = -1, fy = -1, dicha = '';
    const contar = () => {
      if (fx < 0) return;
      dicha = formaEn(fx, fy);
      parent.postMessage({ __cursorDeLaGuia: { x: fx, y: fy, forma: dicha } }, '*');
    };
    addEventListener('mousemove', (e) => { fx = e.clientX; fy = e.clientY; contar(); }, true);
    // Al salir del marco se deja de contar: si no, la página de arriba
    // volvería a poner la punta aquí dentro con cada vuelta del reloj.
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) fx = -1; }, true);
    // Quieto, solo se avisa si cambia la forma (un menú que se abre debajo).
    setInterval(() => { if (fx >= 0 && formaEn(fx, fy) !== dicha) contar(); }, 120);
    window.__cursor = true;
    return;
  }
  const DIBUJOS = { flecha: ${JSON.stringify(SVG_FLECHA)}, mano: ${JSON.stringify(SVG_MANO)}, texto: ${JSON.stringify(SVG_TEXTO)} };
  const PUNTA = ${JSON.stringify(PUNTA)};
  const c = document.createElement('div');
  c.id = '__cursor';
  Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',lineHeight:'0',
    filter:'drop-shadow(0 1px 1.5px rgba(0,0,0,.35))'});
  const cap = document.createElement('div');
  cap.id = '__rotulo';
  Object.assign(cap.style, {position:'fixed',left:'50%',bottom:'28px',transform:'translateX(-50%)',background:'rgba(15,23,42,.88)',
    color:'#fff',font:'600 18px Poppins, Arial, sans-serif',padding:'12px 22px',borderRadius:'14px',zIndex:2147483646,
    pointerEvents:'none',opacity:'0',transition:'opacity .3s',boxShadow:'0 10px 30px rgba(0,0,0,.25)'});
  let x = -100, y = -100, forma = '';
  /** La forma que dijo el iframe que está bajo la punta (null si la punta no está en uno). */
  let enMarco = null;
  // A pantalla completa solo se ve el elemento que la ocupa: el cursor y el
  // rótulo viven donde se ve, y vuelven al <body> al salir.
  const dondeSeVe = () => document.fullscreenElement || document.body;
  const poner = () => { dondeSeVe().appendChild(cap); dondeSeVe().appendChild(c); };
  const pintar = (f) => {
    if (f !== forma) { forma = f; c.innerHTML = DIBUJOS[f]; document.documentElement.dataset.cursorDeLaGuia = f; }
    c.style.transform = 'translate(' + (x - PUNTA[f][0]) + 'px,' + (y - PUNTA[f][1]) + 'px)';
  };
  const queForma = () => {
    if (enMarco && document.elementFromPoint(x, y)?.tagName === 'IFRAME') return enMarco;
    return formaEn(x, y);
  };
  const mirar = () => {
    if (!document.body) return;
    // Un diálogo se pinta en un portal al final del <body>: el cursor se
    // vuelve a poner el último para que no quede debajo del velo.
    if (dondeSeVe().lastElementChild !== c) poner();
    pintar(queForma());
  };
  if (document.body) poner(); else addEventListener('DOMContentLoaded', poner);
  addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; enMarco = null; mirar(); }, true);
  addEventListener('message', (e) => {
    const d = e.data && e.data.__cursorDeLaGuia;
    if (!d) return;
    const marco = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
    if (!marco) return;
    const r = marco.getBoundingClientRect();
    x = r.left + marco.clientLeft + d.x;
    y = r.top + marco.clientTop + d.y;
    enMarco = d.forma;
    mirar();
  });
  addEventListener('fullscreenchange', poner);
  setInterval(mirar, 120);
  window.__rotulo = (t) => { cap.textContent = t; cap.style.opacity = t ? '1' : '0'; };
  window.__cursor = true;
})();`;
