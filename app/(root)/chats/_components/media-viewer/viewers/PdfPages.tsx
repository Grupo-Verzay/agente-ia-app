'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { abrirPdf, pintarPagina } from '@/lib/pdf-en-el-navegador';

/**
 * Un PDF pintado por nosotros, pagina a pagina.
 *
 * Antes el visor era un `<iframe src={url}>` y lo pintaba el navegador. En un
 * ordenador funciona; en un movil NO: Chrome y Firefox de Android no saben
 * enseñar un PDF dentro de una pagina, asi que en vez del documento salia un
 * cuadro gris con el icono "PDF", un boton "Abrir" y el nombre INTERNO del
 * archivo (`false_2196...@lid_3EB0...pdf`). El documento no se veia.
 *
 * Ahora lo pinta pdf.js, que es el mismo motor que usa Firefox por dentro y
 * que ya esta en el proyecto para la miniatura de la tarjeta. Da igual el
 * navegador y da igual el telefono.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **Una pagina se pinta cuando se acerca, no antes.** Un catalogo de 63
 *    paginas pintado de golpe se baja entero y tarda un minuto. Con
 *    `IntersectionObserver` se pinta lo que se va a mirar, y pdf.js pide por
 *    rangos solo esa parte del archivo.
 * 2. **Cada pagina se guarda como IMAGEN, no como lienzo.** 63 lienzos de una
 *    pagina son cientos de megas de memoria y en un movil tumban la pestaña;
 *    las mismas 63 en JPEG son unos pocos megas.
 *
 * Y si pdf.js no puede -el almacenamiento no deja pedir el archivo desde el
 * navegador, el PDF esta roto-, **no se queda en blanco**: se cae al `<iframe>`
 * de antes, que en un ordenador sigue funcionando, y el boton de descargar
 * sigue estando arriba.
 */

/** Ancho al que se pinta cada pagina. Mas que esto no se nota y pesa el doble. */
const ANCHO_DE_LA_PAGINA = 1000;

/** Proporcion de una hoja A4 vertical, para el hueco de una pagina sin pintar. */
const PROPORCION_POR_DEFECTO = 1 / 1.414;

interface PdfPagesProps {
  url: string;
  titulo: string;
}

export const PdfPages: React.FC<PdfPagesProps> = ({ url, titulo }) => {
  const documento = useRef<any>(null);
  const [paginas, setPaginas] = useState(0);
  const [proporcion, setProporcion] = useState(PROPORCION_POR_DEFECTO);
  const [pintadas, setPintadas] = useState<Record<number, string>>({});
  const [fallo, setFallo] = useState(false);
  const pidiendo = useRef<Set<number>>(new Set());

  useEffect(() => {
    let vigente = true;
    setPaginas(0);
    setPintadas({});
    setFallo(false);

    void (async () => {
      try {
        const doc = await abrirPdf(url);
        if (!vigente) {
          void doc.destroy();
          return;
        }
        documento.current = doc;
        setPaginas(doc.numPages);
      } catch (error) {
        // Se avisa: un PDF que no se deja leer es algo que interesa saber, y
        // sin esto el visor se cae al iframe sin decir por que.
        console.warn('[chats] no se pudo abrir el PDF en el navegador', {
          motivo: (error as Error)?.message,
        });
        if (vigente) setFallo(true);
      }
    })();

    return () => {
      vigente = false;
      const doc = documento.current;
      documento.current = null;
      if (doc) void doc.destroy();
    };
  }, [url]);

  const pintar = useCallback(async (numero: number) => {
    const doc = documento.current;
    if (!doc || pidiendo.current.has(numero)) return;
    pidiendo.current.add(numero);
    try {
      const hecha = await pintarPagina(doc, numero, ANCHO_DE_LA_PAGINA);
      if (!hecha || !documento.current) return;
      if (numero === 1) setProporcion(hecha.proporcion);
      setPintadas((previo) => ({ ...previo, [numero]: hecha.imagen }));
    } catch (error) {
      // Una pagina que no se pinta deja su hueco; las demas siguen. Se avisa
      // una vez por pagina, que es como se sabe si es el PDF o es el visor.
      console.warn('[chats] no se pudo pintar una pagina del PDF', {
        pagina: numero,
        motivo: (error as Error)?.message,
      });
    }
  }, []);

  if (fallo) {
    // El camino de antes. En un ordenador sigue enseñando el documento.
    return (
      <iframe
        src={url}
        title={titulo}
        className="w-full flex-1 bg-white"
        style={{ border: 'none', minHeight: '60vh' }}
      />
    );
  }

  return (
    <div className="w-full overflow-y-auto bg-neutral-200 dark:bg-neutral-800" style={{ maxHeight: '80vh' }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3">
        {paginas === 0 && (
          <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Abriendo el documento…
          </div>
        )}

        {Array.from({ length: paginas }, (_, i) => i + 1).map((numero) => (
          <PaginaDelPdf
            key={numero}
            numero={numero}
            imagen={pintadas[numero]}
            proporcion={proporcion}
            onAcercarse={pintar}
          />
        ))}
      </div>
    </div>
  );
};

PdfPages.displayName = 'PdfPages';

interface PaginaDelPdfProps {
  numero: number;
  imagen: string | undefined;
  proporcion: number;
  onAcercarse: (numero: number) => void;
}

const PaginaDelPdf: React.FC<PaginaDelPdfProps> = React.memo(
  ({ numero, imagen, proporcion, onAcercarse }) => {
    const hueco = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const nodo = hueco.current;
      if (!nodo || imagen) return;
      if (typeof IntersectionObserver === 'undefined') {
        onAcercarse(numero);
        return;
      }
      const vigia = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            vigia.disconnect();
            onAcercarse(numero);
          }
        },
        // Una pantalla de margen: la pagina siguiente se va pintando mientras
        // se lee la actual, y el desplazamiento no se para a esperar.
        { rootMargin: '100% 0px' },
      );
      vigia.observe(nodo);
      return () => vigia.disconnect();
    }, [numero, imagen, onAcercarse]);

    return (
      <div
        ref={hueco}
        className="relative w-full bg-white shadow-sm"
        style={imagen ? undefined : { aspectRatio: String(proporcion) }}
      >
        {imagen ? (
          // Una imagen local ya medida: `next/image` no aporta nada aqui.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen} alt={`Página ${numero}`} className="block w-full h-auto" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {numero}
          </span>
        )}
      </div>
    );
  },
);

PaginaDelPdf.displayName = 'PaginaDelPdf';
