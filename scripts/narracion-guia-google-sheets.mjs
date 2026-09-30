/**
 * Lo que se DICE en el vídeo de la guía de Google Sheets, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-google-sheets.mjs` pulsa en
 * la palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-google-sheets.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Google Sheets: tu hoja dentro de la plataforma",
        texto: "Esta es la pantalla de Google Sheets: aquí vinculas tu hoja de cálculo y la tienes a la mano dentro de la plataforma, sin cambiar de pestaña.",
    },
    menu: {
        rotulo: "El menú: Google Sheets está en Integraciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Google Sheets la encuentras dentro de Integraciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    compartir: {
        rotulo: "1. Comparte tu hoja con este correo",
        texto: "Para vincularla, primero copias este correo y compartes tu hoja con él como Editor, así la plataforma puede escribir en ella.",
    },
    pegar: {
        rotulo: "2. Pega el enlace de tu hoja y guarda",
        texto: "Después pegas aquí el enlace de tu hoja, el de la barra de direcciones, y pulsas Guardar.",
    },
    hoja: {
        rotulo: "Tu hoja, aquí mismo",
        texto: "Y listo: tu hoja aparece aquí mismo, a todo lo alto; la editas sin salir, cambias de pestaña abajo, y con Abrir la llevas a Google Sheets.",
    },
    copiar: {
        rotulo: "Copia su enlace con un clic",
        texto: "Con Copiar link te llevas su enlace para mandarlo a quien lo necesite.",
    },
    cambiar: {
        rotulo: "Cambiar de hoja, o cancelar",
        texto: "Con Cambiar hoja vuelve la tarjeta con tu enlace puesto: pegas otro y guardas, o cancelas y todo sigue igual.",
    },
    noSirve: {
        rotulo: "Si el enlace no sirve, te dice por qué",
        texto: "Si pegas un enlace que no es de una hoja, la pantalla te dice por qué y no lo guarda.",
    },
    cierre: {
        rotulo: "Las respuestas de tus citas llegan solas",
        texto: "Y cada vez que un cliente llena el formulario de una cita, su respuesta llega sola a la pestaña Registro cita. Así se trabaja con Google Sheets.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bGoogle Sheets\b/g, "gugol shits"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
