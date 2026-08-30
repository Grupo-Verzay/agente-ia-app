/**
 * Si la plataforma ofrece descargar listados de clientes.
 *
 * Está APAGADO a propósito.
 *
 * El CRM y el historial de llamadas tenían un botón de exportar que bajaba un
 * archivo con los clientes y su número de WhatsApp, sin mirar quién lo pulsaba.
 * Un asesor entraba, exportaba, y se iba con la lista entera en un clic.
 *
 * Se apaga en vez de esconderlo por rol porque el archivo se arma EN EL
 * NAVEGADOR, con los datos que la pantalla ya tiene cargados: un botón oculto
 * por rol se puede volver a llamar desde las herramientas del navegador, y no
 * habría protegido nada. Lo que no se dibuja no se puede pulsar.
 *
 * Hoy no lo usa nadie, así que no se pierde nada.
 *
 * PARA VOLVER A OFRECERLO no basta con poner esto en `true`: eso devuelve el
 * agujero tal cual. Hay que armar el archivo en el SERVIDOR, que es el único
 * sitio donde se puede comprobar de verdad quién lo pide y tapar lo que esa
 * persona no deba ver.
 */
export const EXPORTACION_DE_CLIENTES_HABILITADA = false;
