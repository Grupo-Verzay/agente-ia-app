'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abrirPdf, pintarPagina } from '@/lib/pdf-en-el-navegador';
import { useMandosDelVisor } from '../mandos-del-visor';

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
 * Al dejar de usar el visor del navegador se perdieron sus mandos, y se noto:
 * "no me da la opcion de que se amplie al ancho de la pantalla". Asi que van
 * aqui, y son los tres que se usan de verdad: **el documento ocupa todo el
 * ancho que haya** -no una columna estrecha en medio de la pantalla-, se puede
 * **acercar y alejar** con un boton para volver al ancho, y se puede **ir a
 * una pagina**, que con un catalogo de 63 es lo que mas falta hace.
 *
 * Los mandos van en la barra de ARRIBA, la del nombre y la descarga, no en una
 * segunda barra debajo: al lado del nombre hay sitio de sobra, y dos barras
 * para un solo documento es una de mas. El visor los publica
 * (`useMandosDelVisor`) y la barra los pinta.
 *
 * Lo que NO se ha traido del visor del navegador: girar, imprimir y buscar
 * texto. Descargar ya esta arriba, en la cabecera del visor.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Una pagina se pinta cuando se acerca, no antes.** Un catalogo de 63
 *    paginas pintado de golpe se baja entero y tarda un minuto. Con
 *    `IntersectionObserver` se pinta lo que se va a mirar, y pdf.js pide por
 *    rangos solo esa parte del archivo.
 * 2. **Cada pagina se guarda como IMAGEN, no como lienzo.** 63 lienzos de una
 *    pagina son cientos de megas de memoria y en un movil tumban la pestaña;
 *    las mismas 63 en JPEG son unos pocos megas.
 * 3. **Acercar NO vuelve a pintar.** Cada pagina se pinta una sola vez, a mas
 *    resolucion de la que se enseña, y el zoom solo la estira. Repintar 63
 *    paginas cada vez que se toca el `+` es volver al problema del punto 1.
 */

/** Cuanto mas fino se pinta de lo que se enseña, para que el zoom no emborrone. */
const FINURA = 2;

/** Limites de lo que se pinta. Ni borroso en un monitor, ni enorme en un movil. */
const ANCHO_MINIMO = 800;
const ANCHO_MAXIMO = 1800;

/** Hasta donde se puede acercar y alejar. */
const ZOOM_MINIMO = 0.5;
const ZOOM_MAXIMO = 3;
const PASO_DEL_ZOOM = 0.25;

/** Proporcion de una hoja A4 vertical, para el hueco de una pagina sin pintar. */
const PROPORCION_POR_DEFECTO = 1 / 1.414;

interface PdfPagesProps {
  url: string;
  titulo: string;
}

export const PdfPages: React.FC<PdfPagesProps> = ({ url, titulo }) => {
  const documento = useRef<any>(null);
  const marco = useRef<HTMLDivElement | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [proporcion, setProporcion] = useState(PROPORCION_POR_DEFECTO);
  const [pintadas, setPintadas] = useState<Record<number, string>>({});
  const [fallo, setFallo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [paginaActual, setPaginaActual] = useState(1);
  const anchoDeRender = useRef(ANCHO_MINIMO);
  const pidiendo = useRef<Set<number>>(new Set());
  const huecos = useRef<Map<number, HTMLDivElement>>(new Map());
  const fotograma = useRef<number | null>(null);

  /** Apuntar donde esta cada pagina, para saber cual se esta mirando. */
  const apuntarHueco = useCallback((numero: number, nodo: HTMLDivElement | null) => {
    if (nodo) huecos.current.set(numero, nodo);
    else huecos.current.delete(numero);
  }, []);

  /**
   * Que pagina se esta mirando.
   *
   * Se mide UNA VEZ POR FOTOGRAMA (`requestAnimationFrame`), como la lista de
   * chats: el navegador dispara `scroll` muchas mas veces de las que puede
   * pintar, y recorrer las paginas en cada uno pone el desplazamiento pegajoso.
   */
  const alDesplazar = useCallback(() => {
    if (fotograma.current !== null) return;
    fotograma.current = requestAnimationFrame(() => {
      fotograma.current = null;
      const caja = marco.current;
      if (!caja) return;
      const arriba = caja.getBoundingClientRect().top;
      let mirando = 1;
      for (const [numero, nodo] of huecos.current) {
        // La primera pagina cuyo final queda por debajo del borde de arriba.
        if (nodo.getBoundingClientRect().bottom > arriba + 8) {
          mirando = numero;
          break;
        }
      }
      setPaginaActual((previo) => (previo === mirando ? previo : mirando));
    });
  }, []);

  useEffect(() => () => {
    if (fotograma.current !== null) cancelAnimationFrame(fotograma.current);
  }, []);

  const irA = useCallback((numero: number) => {
    const destino = Math.min(Math.max(1, numero), paginas || 1);
    huecos.current.get(destino)?.scrollIntoView({ block: 'start' });
  }, [paginas]);

  // A que resolucion se pinta. Se mide UNA vez, al abrir: si cambiara con el
  // ancho de la ventana, redimensionarla obligaria a repintarlo todo.
  useEffect(() => {
    const ancho = marco.current?.clientWidth ?? 0;
    if (!ancho) return;
    const nitido = ancho * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    anchoDeRender.current = Math.round(
      Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, nitido * (FINURA / 2))),
    );
  }, []);

  useEffect(() => {
    let vigente = true;
    setPaginas(0);
    setPintadas({});
    setFallo(false);
    setZoom(1);
    setPaginaActual(1);
    huecos.current.clear();

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
      const hecha = await pintarPagina(doc, numero, anchoDeRender.current);
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

  const acercar = () => setZoom((z) => Math.min(ZOOM_MAXIMO, z + PASO_DEL_ZOOM));
  const alejar = () => setZoom((z) => Math.max(ZOOM_MINIMO, z - PASO_DEL_ZOOM));

  // Los mandos suben a la barra de arriba. Un hook no puede ir detras de un
  // `return`, asi que esto va ANTES del caso de fallo -y con `fallo` en las
  // dependencias, para que al caer al iframe se retiren-.
  useMandosDelVisor(
    fallo || paginas === 0 ? null : (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={alejar}
          disabled={zoom <= ZOOM_MINIMO}
          aria-label="Alejar"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={acercar}
          disabled={zoom >= ZOOM_MAXIMO}
          aria-label="Acercar"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
          aria-label="Ajustar al ancho"
          title="Ajustar al ancho"
        >
          <Scan className="h-4 w-4" />
        </Button>
        <span className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            min={1}
            max={paginas}
            value={paginaActual}
            onChange={(e) => {
              const pedida = Number(e.target.value);
              if (Number.isFinite(pedida)) {
                setPaginaActual(pedida);
                irA(pedida);
              }
            }}
            aria-label="Ir a la página"
            className="h-7 w-12 rounded border border-border bg-background px-1 text-center tabular-nums text-foreground"
          />
          de {paginas}
        </span>
      </>
    ),
    [fallo, paginas, paginaActual, zoom, irA],
  );

  if (fallo) {
    // El camino de antes. En un ordenador sigue enseñando el documento.
    return (
      <iframe
        src={url}
        title={titulo}
        className="w-full h-full bg-white"
        style={{ border: 'none', minHeight: '60vh' }}
      />
    );
  }


  return (
    <div className="flex h-full w-full flex-col bg-neutral-200 dark:bg-neutral-800">
      <div ref={marco} onScroll={alDesplazar} className="min-h-0 flex-1 overflow-auto">
        {paginas === 0 && (
          <div className="flex h-full min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Abriendo el documento…
          </div>
        )}

        {/* Al 100% el documento ocupa TODO el ancho que haya. Antes iba en una
            columna de 768 px en medio de la pantalla, con el hueco a los lados
            y la letra pequeña. */}
        <div
          className="mx-auto flex flex-col gap-2 p-2"
          style={{ width: `${zoom * 100}%` }}
        >
          {Array.from({ length: paginas }, (_, i) => i + 1).map((numero) => (
            <PaginaDelPdf
              key={numero}
              numero={numero}
              imagen={pintadas[numero]}
              proporcion={proporcion}
              onAcercarse={pintar}
              onMontar={apuntarHueco}
            />
          ))}
        </div>
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
  onMontar: (numero: number, nodo: HTMLDivElement | null) => void;
}

const PaginaDelPdf: React.FC<PaginaDelPdfProps> = React.memo(
  ({ numero, imagen, proporcion, onAcercarse, onMontar }) => {
    const hueco = useRef<HTMLDivElement | null>(null);

    // Se apunta al montar y se borra al desmontar, para que la barra sepa por
    // que pagina va y el salto tenga a donde ir.
    useEffect(() => {
      onMontar(numero, hueco.current);
      return () => onMontar(numero, null);
    }, [numero, onMontar]);

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
