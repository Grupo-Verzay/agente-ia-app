/**
 * Los BUZONES Y CORREOS DE EJEMPLO de la guía de Correos.
 *
 * Los leen dos sitios, y por eso viven aparte: la semilla
 * (`sembrar-guia-correo.mjs`), que guarda los buzones con sus credenciales
 * selladas, y el Gmail fingido (`fingido-guia-correo.mjs`), que contesta como
 * contestaría Gmail con estos correos dentro. Con la lista escrita en los dos,
 * un buzón sembrado no tendría correos o un correo saldría de un buzón que no
 * existe.
 *
 * Todo es inventado —nombres, direcciones y textos—: la guía es pública. Las
 * fechas van en MINUTOS ATRÁS, contadas desde que arranca el servidor, así la
 * lista enseña «hace un rato», «ayer» y «hace unos días» se genere cuando se
 * genere.
 */

const MIN = 60;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Un PDF de una página, mínimo pero válido, para los adjuntos de ejemplo. */
function unPdf(titulo) {
    const texto = `BT /F1 18 Tf 72 720 Td (${titulo}) Tj ET`;
    const objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const desplazamientos = [];
    objetos.forEach((o, i) => {
        desplazamientos.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const d of desplazamientos) pdf += `${String(d).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, "latin1");
}

/** Un PNG de 1×1 azul: lo justo para que el adjunto sea una imagen de verdad. */
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
);

const pdf = (nombre, titulo) => ({ nombre, tipo: "application/pdf", bytes: unPdf(titulo) });
const png = (nombre) => ({ nombre, tipo: "image/png", bytes: PNG });

/**
 * Los tres buzones de la cuenta de ejemplo. `token` es el access token que la
 * semilla sella en sus credenciales y con el que el Gmail fingido sabe de qué
 * buzón le preguntan.
 */
export const BUZONES = [
    { clave: "ventas", direccion: "ventas@minegocio.co", nombre: "Ventas · Mi Negocio", token: "guia-correo-ventas", firma: null },
    {
        clave: "soporte",
        direccion: "soporte@minegocio.co",
        nombre: "Soporte · Mi Negocio",
        token: "guia-correo-soporte",
        firma: "Laura Gómez\nSoporte · Mi Negocio",
    },
    { clave: "facturacion", direccion: "facturacion@minegocio.co", nombre: "Facturación · Mi Negocio", token: "guia-correo-facturacion", firma: null },
];

/**
 * Los correos de cada buzón. `hace` en segundos; `etiquetas` son las de Gmail
 * (`INBOX` para la bandeja de entrada, `UNREAD`, `STARRED`). Sin `INBOX` es un
 * correo archivado.
 */
export const CORREOS = {
    ventas: [
        {
            id: "v1",
            de: "Mariana Toro <mariana.toro@tiendamariana.co>",
            asunto: "Cotización del plan Business",
            texto:
                "Hola, buenos días.\n\nTengo una tienda de ropa y quiero que me ayuden a responder los chats de WhatsApp. " +
                "Les adjunto los requisitos de la tienda. ¿Me pueden enviar la cotización del plan Business con tres usuarios?\n\n" +
                "Quedo atenta.\nMariana Toro",
            hace: 25 * MIN,
            etiquetas: ["INBOX", "UNREAD", "STARRED"],
            adjuntos: [pdf("requisitos-tienda.pdf", "Requisitos de la tienda")],
        },
        {
            id: "v2",
            de: "Andrés Gómez <andres.gomez@ferreteriagomez.co>",
            asunto: "Pregunta sobre la demostración",
            texto: "Hola, ¿la demostración del jueves es por videollamada o presencial? Gracias.\n\nAndrés",
            hace: 70 * MIN,
            etiquetas: ["INBOX", "UNREAD"],
        },
        {
            id: "v3",
            de: "Distribuidora El Sol <pedidos@distribuidoraelsol.co>",
            asunto: "Pedido 2045 confirmado",
            texto: "Su pedido 2045 fue confirmado y sale mañana. Adjuntamos la factura.\n\nDistribuidora El Sol",
            hace: 3 * HORA,
            etiquetas: ["INBOX"],
            adjuntos: [pdf("factura-2045.pdf", "Factura 2045")],
        },
        {
            id: "v4",
            de: "Camila Rojas <camila.rojas@estudiocamila.co>",
            asunto: "¿Tienen descuento por pago anual?",
            texto: "Hola, me interesa el plan Esencial. ¿Hay descuento si pago el año completo?\n\nCamila",
            hace: 1 * DIA + 2 * HORA,
            etiquetas: ["INBOX", "STARRED"],
        },
        {
            id: "v5",
            de: "Pedro Salazar <pedro.salazar@inmobiliariasalazar.co>",
            asunto: "Reunión del jueves",
            texto: "Confirmo la reunión del jueves a las 3 p. m. en su oficina.\n\nPedro Salazar",
            hace: 2 * DIA,
            etiquetas: ["INBOX"],
        },
        {
            id: "v6",
            de: "Lucía Ramírez <lucia.ramirez@panaderialucia.co>",
            asunto: "Gracias por la atención",
            texto: "Muchas gracias por la atención de ayer. Todo quedó funcionando.\n\nLucía",
            hace: 4 * DIA,
            etiquetas: ["INBOX"],
        },
        {
            id: "v7",
            de: "Mi Negocio <ventas@minegocio.co>",
            asunto: "Bienvenida a la plataforma",
            texto: "Tu cuenta quedó lista. Este correo ya lo leíste y lo archivaste.",
            hace: 9 * DIA,
            etiquetas: [],
        },
    ],
    soporte: [
        {
            id: "s1",
            de: "Jorge Pérez <jorge.perez@restauranteelfogon.co>",
            asunto: "No puedo entrar a mi cuenta",
            texto: "Buenas tardes. Desde ayer no puedo entrar a mi cuenta, me dice que la contraseña no es correcta. ¿Me ayudan?\n\nJorge",
            hace: 10 * MIN,
            etiquetas: ["INBOX", "UNREAD"],
        },
        {
            id: "s2",
            de: "Sofía Martínez <sofia.martinez@clinicasonrisa.co>",
            asunto: "Cambio de número de WhatsApp",
            texto: "Hola, vamos a cambiar el número de WhatsApp de la clínica. Les envío la captura del número nuevo.\n\nSofía",
            hace: 2 * HORA,
            etiquetas: ["INBOX", "UNREAD"],
            adjuntos: [png("numero-nuevo.png")],
        },
        {
            id: "s3",
            de: "Hotel Las Palmas <reservas@hotellaspalmas.co>",
            asunto: "Ya funciona la respuesta automática",
            texto: "Les confirmamos que la respuesta automática ya está funcionando. ¡Gracias!\n\nHotel Las Palmas",
            hace: 5 * HORA,
            etiquetas: ["INBOX"],
        },
        {
            id: "s4",
            de: "Daniel Ruiz <daniel.ruiz@talleresruiz.co>",
            asunto: "Solicitud de factura",
            texto: "¿Me pueden enviar la factura del mes pasado a este correo?\n\nDaniel",
            hace: 1 * DIA + 5 * HORA,
            etiquetas: ["INBOX"],
        },
        {
            id: "s5",
            de: "Jorge Pérez <jorge.perez@restauranteelfogon.co>",
            asunto: "Caso resuelto: contraseña",
            texto: "Ya pude entrar, muchas gracias.",
            hace: 12 * DIA,
            etiquetas: [],
        },
    ],
    facturacion: [
        {
            id: "f1",
            de: "Banco del Valle <extractos@bancodelvalle.co>",
            asunto: "Extracto de septiembre",
            texto: "Adjuntamos el extracto de su cuenta del mes de septiembre.\n\nBanco del Valle",
            hace: 40 * MIN,
            etiquetas: ["INBOX", "UNREAD"],
            adjuntos: [pdf("extracto-septiembre.pdf", "Extracto de septiembre")],
        },
        {
            id: "f2",
            de: "Paula Herrera <paula.herrera@contadorespaula.co>",
            asunto: "Documentos para la declaración",
            texto: "Hola, te comparto la lista de documentos que necesito para la declaración.\n\nPaula",
            hace: 1 * DIA + 7 * HORA,
            etiquetas: ["INBOX"],
            adjuntos: [pdf("lista-de-documentos.pdf", "Lista de documentos")],
        },
        {
            id: "f3",
            de: "Proveedor Andina <cartera@proveedorandina.co>",
            asunto: "Recordatorio de pago",
            texto: "Le recordamos que la factura 318 vence el viernes.\n\nProveedor Andina",
            hace: 2 * DIA + 3 * HORA,
            etiquetas: ["INBOX"],
        },
    ],
};
