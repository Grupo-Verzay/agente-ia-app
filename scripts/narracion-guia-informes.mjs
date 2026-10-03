/**
 * Lo que se DICE en el vídeo de la guía de Informes, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads: una frase por idea, con lo que se
 * hace en pantalla DENTRO de la frase (`alDecir`). La frase de la barra de
 * arriba es LA MISMA que en todas las guías, letra por letra.
 *
 * El banco (`lib/__tests__/video-guia-informes.test.mjs`) comprueba que el
 * guion las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Informes: los números de tu negocio",
        texto: "Esta es Informes: aquí ves en una sola pantalla los números de tu negocio, ordenados en secciones que puedes plegar.",
    },
    menu: {
        rotulo: "El menú: Informes está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, e Informes lo encuentras dentro de Panel, como Estadísticas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    periodo: {
        rotulo: "El periodo: cuántos días miras",
        texto: "Con estos botones eliges cuántos días miras: siete, treinta o noventa días, o todo, y todas las gráficas se recalculan solas al momento.",
    },
    cuentas: {
        rotulo: "Las cuentas de tu familia",
        texto: "Si tienes sucursales, en este botón juntas todas las cuentas o miras solo la tuya.",
    },
    barra: {
        rotulo: "Buscar, filtrar, secciones y exportar",
        texto: "En la barra buscas una sección por su nombre, filtras por la temperatura del lead, eliges qué secciones ver y exportas las cifras a un archivo.",
    },
    plegar: {
        rotulo: "Plegar una sección",
        texto: "Y cada sección se pliega pulsando su título, para dejar a la vista solo lo que te interesa.",
    },
    actividad: {
        rotulo: "Actividad, agente IA, leads y citas",
        texto: "Primero ves la actividad del periodo y cómo trabaja tu agente; después tus leads por temperatura, tus seguimientos y tus citas.",
    },
    clientes: {
        rotulo: "Llamadas, satisfacción y sentimiento",
        texto: "Más abajo, tus llamadas, la nota que te ponen tus clientes por asesor y las conversaciones donde un cliente se molestó.",
    },
    cierre: {
        rotulo: "Ventas, productos y créditos",
        texto: "Y al final, tus sesiones, flujos y etiquetas, tus ventas y gastos, tus productos y los créditos de IA que te quedan. Así lees tu negocio de un vistazo.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bIA\b/g, "i a"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
