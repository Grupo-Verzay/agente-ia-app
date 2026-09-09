/**
 * Abrir un PDF en el navegador, en un solo sitio.
 *
 * Lo usan la tarjeta del documento -para la miniatura y el numero de paginas- y
 * el visor -para pintarlo entero-. Viviendo aqui, el worker se configura una
 * vez y las dos usan los mismos ajustes: si se cambian en un lado y en el otro
 * no, uno de los dos empieza a bajarse archivos de cientos de megas sin que se
 * note hasta que alguien mira la factura de datos.
 */

/** El tipo del documento, sin arrastrar `pdfjs-dist` a quien solo lo declara. */
export type DocumentoPdf = Awaited<ReturnType<typeof abrirPdf>>;

/**
 * `pdfjs-dist` se carga bajo demanda: pesa cerca de un mega y solo hace falta
 * cuando hay un PDF delante.
 */
async function cargarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // El worker sale del propio paquete. Sin el, pdf.js trabaja en el hilo
  // principal y la pantalla se congela mientras lee.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();
  return pdfjs;
}

export async function abrirPdf(url: string) {
  const pdfjs = await cargarPdfjs();
  return pdfjs.getDocument({
    url,
    // Que pdf.js pida por RANGOS lo que necesita para la pagina que se esta
    // mirando, en vez del archivo entero. Un catalogo de 126 MB no se baja
    // completo para enseñar la primera pagina.
    disableAutoFetch: true,
    disableStream: false,
    disableFontFace: true,
  }).promise;
}

/**
 * Una pagina como imagen, ya medida al ancho que se le pida.
 *
 * Devuelve una imagen -no un `<canvas>`- a proposito: un catalogo de 63 paginas
 * con un lienzo por pagina son cientos de megas de memoria y en un movil eso
 * tumba la pestaña. Una imagen JPEG de la misma pagina son unos cien kilobytes.
 */
export async function pintarPagina(
  documento: { getPage: (n: number) => Promise<any> },
  numero: number,
  anchoEnPixeles: number,
): Promise<{ imagen: string; proporcion: number } | null> {
  const pagina = await documento.getPage(numero);
  const medida = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: anchoEnPixeles / medida.width });

  const lienzo = document.createElement('canvas');
  lienzo.width = Math.floor(vista.width);
  lienzo.height = Math.floor(vista.height);
  const pincel = lienzo.getContext('2d');
  if (!pincel) return null;

  // Fondo blanco: un PDF sin fondo propio saldria transparente, y en modo
  // oscuro no se veria nada.
  pincel.fillStyle = '#ffffff';
  pincel.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: pincel, viewport: vista }).promise;

  return {
    imagen: lienzo.toDataURL('image/jpeg', 0.82),
    proporcion: medida.width / medida.height,
  };
}
