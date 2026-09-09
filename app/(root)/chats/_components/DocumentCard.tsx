'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * La tarjeta de un documento, como la pinta WhatsApp.
 *
 * Antes era un boton azul con el nombre del archivo y una flecha: no se sabia
 * de que iba el documento, ni cuanto ocupaba, ni cuantas paginas tenia. Al lado
 * del mismo PDF en WhatsApp -miniatura de la primera pagina, nombre, "63
 * paginas · 133 MB · PDF"- parecia otra cosa.
 *
 * La miniatura y el numero de paginas salen del PROPIO PDF, leido en el
 * navegador con pdf.js. No se le piden a WhatsApp: su miniatura viaja en
 * `documentMessage.jpegThumbnail`, que es base64 y que `recortarRawAdjuntos`
 * quita al guardar (con razon: son megas por fila). Y leyendolo nosotros vale
 * para los tres proveedores y tambien para los PDF que ya estaban guardados.
 *
 * Tres frenos, porque un PDF puede pesar cientos de megas:
 *
 * 1. **No se toca hasta que la burbuja se ve.** Un `IntersectionObserver`, no
 *    el montaje: en una conversacion con veinte documentos, hacerlo al montar
 *    son veinte descargas de golpe.
 * 2. **Solo se lee el principio.** `disableAutoFetch` deja que pdf.js pida por
 *    rangos lo que necesita para la primera pagina en vez del archivo entero.
 *    Si el servidor NO admite rangos, un archivo grande se bajaria completo
 *    para una miniatura: en ese caso no hay miniatura.
 * 3. **Fallar no rompe nada.** Sin miniatura, la tarjeta sigue diciendo el
 *    nombre, el peso y el tipo, que ya es mas de lo que habia antes.
 */

/** Lo mas grande que se lee sin rangos. Por encima, no hay miniatura. */
const SIN_RANGOS_MAXIMO = 8 * 1024 * 1024;

/** Ancho de la miniatura en pixeles reales, para que no se vea borrosa. */
const ANCHO_DE_LA_MINIATURA = 640;

interface FichaDelPdf {
  miniatura: string | null;
  paginas: number | null;
}

/**
 * Lo ya leido, por URL.
 *
 * La lista de chats se repinta a menudo (ver CLAUDE.md), y sin esto cada
 * repintado volveria a leer el PDF. Es del proceso, no del componente.
 */
const yaLeido = new Map<string, FichaDelPdf>();

function pesoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function esPdf(mimeType: string, fileName: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType.endsWith('/pdf') ||
    /\.pdf$/i.test(fileName)
  );
}

/** El tipo en corto, para la linea de abajo: PDF, DOCX, XLSX… */
function tipoEnCorto(mimeType: string, fileName: string): string {
  const extension = fileName.split('?')[0].split('.').pop() ?? '';
  if (/^[a-z0-9]{2,5}$/i.test(extension)) return extension.toUpperCase();
  const parte = (mimeType.split('/')[1] ?? '')
    .replace('vnd.openxmlformats-officedocument.', '')
    .replace('vnd.ms-', '');
  return parte ? parte.toUpperCase().slice(0, 12) : 'ARCHIVO';
}

/**
 * La primera pagina y cuantas hay.
 *
 * pdf.js se carga aqui dentro, no arriba: pesa cerca de un mega y solo hace
 * falta cuando hay un PDF a la vista.
 */
async function leerElPdf(url: string): Promise<FichaDelPdf> {
  const pdfjs = await import('pdfjs-dist');
  // El worker sale del propio paquete. Sin el, pdf.js trabaja en el hilo
  // principal y la lista se congela mientras lee.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();

  const tarea = pdfjs.getDocument({
    url,
    // Que pdf.js pida por RANGOS lo que necesita para la primera pagina en vez
    // del archivo entero. Va fijo, no atado a lo que dijera la cabecera: pdf.js
    // negocia los rangos por su cuenta, y si el servidor no los admite se baja
    // el archivo igual. Atarlo a la cabecera hacia que, cuando esta no volvia
    // -y entonces no sabemos nada-, se cayera en la peor combinacion: bajarselo
    // entero de golpe.
    disableAutoFetch: true,
    disableStream: false,
    // Las fuentes del sistema no hacen falta para una miniatura.
    disableFontFace: true,
  });

  const documento = await tarea.promise;
  try {
    const pagina = await documento.getPage(1);
    const medida = pagina.getViewport({ scale: 1 });
    const escala = ANCHO_DE_LA_MINIATURA / medida.width;
    const vista = pagina.getViewport({ scale: escala });

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(vista.width);
    lienzo.height = Math.floor(vista.height);
    const pincel = lienzo.getContext('2d');
    if (!pincel) return { miniatura: null, paginas: documento.numPages };

    // Fondo blanco: un PDF sin fondo propio saldria transparente y en modo
    // oscuro no se veria nada.
    pincel.fillStyle = '#ffffff';
    pincel.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: pincel, viewport: vista }).promise;

    return { miniatura: lienzo.toDataURL('image/jpeg', 0.75), paginas: documento.numPages };
  } finally {
    void documento.destroy();
  }
}

interface DocumentCardProps {
  url: string;
  fileName: string;
  mimeType: string;
  onOpen: () => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = React.memo(
  ({ url, fileName, mimeType, onOpen }) => {
    const caja = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [peso, setPeso] = useState<string>('');
    const [ficha, setFicha] = useState<FichaDelPdf>(
      () => yaLeido.get(url) ?? { miniatura: null, paginas: null },
    );

    // Nada se pide hasta que la burbuja entra en pantalla.
    useEffect(() => {
      const nodo = caja.current;
      if (!nodo || visible) return;
      if (typeof IntersectionObserver === 'undefined') {
        setVisible(true);
        return;
      }
      const vigia = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            setVisible(true);
            vigia.disconnect();
          }
        },
        { rootMargin: '200px' },
      );
      vigia.observe(nodo);
      return () => vigia.disconnect();
    }, [visible]);

    useEffect(() => {
      if (!visible || !url) return;
      let vigente = true;

      void (async () => {
        // El peso sale de una cabecera, sin bajarse el archivo.
        let bytes = 0;
        let porRangos = false;
        try {
          const cabeceras = await fetch(url, { method: 'HEAD' });
          bytes = Number(cabeceras.headers.get('content-length') ?? 0);
          porRangos = (cabeceras.headers.get('accept-ranges') ?? '').includes('bytes');
          if (vigente && bytes > 0) setPeso(pesoLegible(bytes));
        } catch {
          // Sin cabeceras no hay peso; la tarjeta sigue diciendo el nombre.
          // No se avisa en consola: una cabecera que no vuelve es corriente
          // (una URL caducada) y llenaria la consola en cada conversacion.
        }

        if (!vigente) return;
        if (yaLeido.has(url)) return;
        if (!esPdf(mimeType, fileName)) return;
        // El unico caso en que no se intenta: SABEMOS que no hay rangos y el
        // archivo es grande. Ahi leer la primera pagina significa bajarse el
        // archivo entero, y un catalogo de 133 MB no compensa una miniatura.
        // Si la cabecera no volvio no sabemos nada, y se intenta: pdf.js
        // negocia los rangos el mismo.
        if (bytes > SIN_RANGOS_MAXIMO && !porRangos) return;

        try {
          const leida = await leerElPdf(url);
          yaLeido.set(url, leida);
          if (vigente) setFicha(leida);
        } catch (error) {
          // Se avisa una vez por documento: un PDF que no se deja leer es algo
          // que interesa saber, y sin esto la tarjeta se queda sin miniatura
          // en silencio. El resto de la tarjeta sigue en pie.
          yaLeido.set(url, { miniatura: null, paginas: null });
          console.warn('[chats] no se pudo leer la primera pagina del PDF', {
            archivo: fileName,
            motivo: (error as Error)?.message,
          });
        }
      })();

      return () => {
        vigente = false;
      };
    }, [visible, url, mimeType, fileName]);

    const detalle = [
      ficha.paginas ? `${ficha.paginas} ${ficha.paginas === 1 ? 'página' : 'páginas'}` : '',
      peso,
      tipoEnCorto(mimeType, fileName),
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <button
        ref={caja}
        type="button"
        onClick={onOpen}
        className="w-full text-left bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Abrir ${fileName || 'documento'}`}
      >
        {ficha.miniatura && (
          // Una imagen local (data URL) ya medida: `next/image` no aporta nada
          // aqui y obligaria a declarar el dominio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ficha.miniatura}
            alt=""
            aria-hidden="true"
            className="w-full h-[150px] object-cover object-top border-b dark:border-gray-600"
          />
        )}

        <div className={cn('flex items-center gap-2 p-3', !ficha.miniatura && 'py-3')}>
          <FileText className="w-5 h-5 flex-shrink-0 text-red-500 dark:text-red-400" />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100"
              title={fileName || 'Documento'}
            >
              {fileName || 'Documento'}
            </span>
            {detalle && (
              <span className="block text-xs text-gray-500 dark:text-gray-400">{detalle}</span>
            )}
          </span>
        </div>
      </button>
    );
  },
);

DocumentCard.displayName = 'DocumentCard';
