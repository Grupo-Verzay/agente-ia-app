/**
 * Lo que se DICE en el vídeo de la guía de Correos, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-correo.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y su audio sale de la misma
 * entrada de la caché.
 *
 * El vídeo no conecta ningún correo de verdad ni envía nada: señala los botones
 * de conectar, la flecha de enviar y la confirmación de eliminar, y los deja.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-correo.test.mjs`) lo comprueba.
 */
export const NARRACION = {
    intro: {
        rotulo: "Correos: los correos de tu negocio en la plataforma",
        texto: "Esta es la pantalla de Correos: aquí lees y respondes los correos de tu negocio sin salir de la plataforma, con todos tus buzones en un solo lugar.",
    },
    menu: {
        rotulo: "El menú: está en Bandeja",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Correos lo encuentras dentro de Bandeja, al lado de Chats.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    conectar: {
        rotulo: "Conecta Gmail, Outlook o tu propio dominio",
        texto: "Para conectar un correo, en los tres puntos eliges Conectar otro correo: Gmail y Outlook se conectan con un botón, y un correo de tu propio dominio con sus datos.",
    },
    buzones: {
        rotulo: "Todos tus buzones juntos, o uno solo",
        texto: "Con varios buzones, el selector de arriba los junta en Todas, y cada correo lleva la marca de su buzón; o eliges uno y ves solo lo suyo.",
    },
    buscar: {
        rotulo: "Busca por nombre o asunto",
        texto: "El buscador filtra la lista mientras escribes, y con el botón de al lado eliges si busca en todo, en el remitente o en el asunto.",
    },
    filtros: {
        rotulo: "Destacados, Sin leer, Archivados",
        texto: "Las pastillas filtran con un toque: Destacados, Sin leer o Archivados, y la flecha del final guarda Leídos, Con adjuntos y Anclados.",
    },
    seleccion: {
        rotulo: "Varios correos a la vez",
        texto: "Marca varios correos con su casilla y la barra cambia: los marcas como leídos, los destacas, los archivas, los exportas o los eliminas juntos.",
    },
    leer: {
        rotulo: "Abre un correo y organízalo",
        texto: "Al abrir un correo lo lees a la derecha, con sus archivos, y arriba tienes responder, reenviar, destacar, eliminar y más.",
    },
    responder: {
        rotulo: "Responde con archivos y la firma del buzón",
        texto: "Para responder escribes abajo, adjuntas tus archivos con el clip, y la firma de ese buzón va sola al final.",
    },
    reenviar: {
        rotulo: "Reenvía con sus archivos",
        texto: "Con Reenviar escribes a quién se lo mandas y unas líneas tuyas: los archivos del correo van incluidos.",
    },
    nuevo: {
        rotulo: "Escribe un correo nuevo",
        texto: "Y para escribir uno nuevo, en la flecha eliges Nuevo correo: desde qué buzón sale, para quién, el asunto y tu mensaje. Así se trabaja con Correos.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** El texto tal cual se le pasa a la voz. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [re, por]) => t.replace(re, por), texto);
}
