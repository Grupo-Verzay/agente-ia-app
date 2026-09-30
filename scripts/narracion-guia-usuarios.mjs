/**
 * Lo que se DICE en el vídeo de la guía de Usuarios, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-usuarios.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, salvo el reparto, que va al
 * FINAL a propósito: cambiar de modo con la auto-asignación encendida reparte
 * en ese momento lo que estaba sin asesor, así que enseñado antes dejaría el
 * Pipeline sin nada que arrastrar y «Asignar sin atender» sin nada que
 * repartir. El banco
 * (`lib/__tests__/video-guia-usuarios.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Usuarios: tu equipo en una pantalla",
        texto: "Esta es la pantalla de Usuarios: aquí armas tu equipo, ves cuánto lleva cada persona y decides cómo se reparten los chats.",
    },
    menu: {
        rotulo: "El menú: Usuarios está en Entrenamiento",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Usuarios lo encuentras dentro de Entrenamiento.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    crear: {
        rotulo: "Crea a una persona con su rol",
        texto: "Con el botón Nuevo creas a una persona: su nombre, su correo, una contraseña y su rol, y ya puede entrar.",
    },
    rol: {
        rotulo: "Rol y disponibilidad, al momento",
        texto: "En la tabla le cambias el rol, y con Disponible decides si recibe chats nuevos: el punto verde lo dice de un vistazo.",
    },
    medir: {
        rotulo: "Cuánto lleva cada persona",
        texto: "Las columnas te dicen cuántas conversaciones lleva cada persona, cuántas están calientes y cuántas convirtió, y debajo lo ves en gráficas.",
    },
    pipeline: {
        rotulo: "El Pipeline: una columna por persona",
        texto: "En el Pipeline cada persona tiene su columna, y arrastras un contacto sin asignar a quien quieras que lo atienda.",
    },
    permisos: {
        rotulo: "Qué ve cada persona",
        texto: "Con el menú de cada fila eliges sus módulos y sus permisos, o sea qué partes de la plataforma puede ver.",
    },
    asignar: {
        rotulo: "Asignar sin atender, de una vez",
        texto: "Con Asignar sin atender repartes de una vez todo lo que estaba sin asesor, entre la gente disponible.",
    },
    reparto: {
        rotulo: "La auto-asignación reparte los chats sola",
        texto: "Con la auto-asignación encendida, cada chat nuevo va solo a alguien disponible, con un tope de chats por persona o sin tope.",
    },
    porcentaje: {
        rotulo: "O por porcentaje: a cada uno su parte",
        texto: "Y por porcentaje le das a cada persona su parte, y la suma te avisa en verde cuando llega a cien. Así se trabaja con Usuarios.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bPipeline\b/g, "paiplain"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
