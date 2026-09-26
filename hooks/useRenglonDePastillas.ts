'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ANCHO_DE_LA_CONTADORA_PX } from '@/lib/pastillas-de-la-fila';
import { repartirLasPastillas } from '@/lib/renglon-de-pastillas';

/**
 * Un solo `ResizeObserver` para TODA la lista.
 *
 * La bandeja monta decenas de filas a la vez —la ventana virtualizada— y cada
 * una necesita enterarse de que su renglón cambió de ancho. Un observador por
 * fila serían decenas de objetos; uno solo admite observar N elementos y
 * entrega **una sola llamada** con todas las entradas, que es lo que hace que
 * esto no encarezca la lista.
 */
let observador: ResizeObserver | null = null;
const avisos = new WeakMap<Element, () => void>();

function observarElAncho(nodo: Element, aviso: () => void) {
    if (typeof ResizeObserver === 'undefined') return () => {};
    if (!observador) {
        observador = new ResizeObserver((entradas) => {
            for (const entrada of entradas) avisos.get(entrada.target)?.();
        });
    }
    avisos.set(nodo, aviso);
    observador.observe(nodo);
    return () => {
        avisos.delete(nodo);
        observador?.unobserve(nodo);
    };
}

type Reparto = { firma: string; visibles: number };

/**
 * Mide el renglón de pastillas de una fila y dice cuántas caben.
 *
 * La decisión es `repartirLasPastillas` (pura); esto solo mide. Y mide **los
 * nodos que ya están pintados**, sin una fila fantasma: duplicar ocho pastillas
 * —cada una con su `TooltipProvider`— por cada fila de una lista de miles es
 * justo lo que *la lista es grande, no rehacerla por gusto* evita.
 *
 * # Los anchos se RECUERDAN, y por eso no hace falta la copia invisible
 *
 * El primer pintado de una firma lleva **todas** las pastillas, así que esa
 * pasada las mide todas y las guarda por posición. A partir de ahí el renglón
 * ya no las tiene todas —unas se fueron al «+N»— pero sus anchos siguen
 * guardados, y siguen valiendo: una pastilla va `shrink-0` con su contenido
 * fijo, así que su ancho no cambia porque cambie el de la columna. Cuando
 * cambia la FIRMA —llega una etiqueta, se asigna un asesor— se olvidan y se
 * vuelve a empezar con todas.
 *
 * Sin eso, la segunda medida solo vería las que quedaron y el reparto
 * oscilaría: es el mismo motivo por el que `PestanasDelChat` mide una fila
 * aparte en vez de la que se ve.
 *
 * @param firma  Qué pastillas hay, en orden. Al cambiar, se vuelve a medir.
 * @param total  Cuántas pastillas reparten sitio.
 * @param fijas  Cuántas van siempre detrás de ellas (la de etiquetas: 0 o 1).
 */
export function useRenglonDePastillas(firma: string, total: number, fijas: number) {
    const renglon = useRef<HTMLDivElement | null>(null);
    const medidas = useRef<{ firma: string; anchos: number[]; fijas: number[]; mas: number }>({
        firma: '',
        anchos: [],
        fijas: [],
        mas: NaN,
    });
    const [reparto, setReparto] = useState<Reparto>({ firma, visibles: total });

    // Un reparto de OTRA firma no vale: se pintan todas hasta la próxima
    // medida, que llega en el mismo fotograma (`useLayoutEffect`).
    const seVen = reparto.firma === firma ? Math.min(reparto.visibles, total) : total;

    const medir = useCallback(() => {
        const nodo = renglon.current;
        if (!nodo) return;
        const m = medidas.current;
        if (m.firma !== firma) {
            m.firma = firma;
            m.anchos = [];
            m.fijas = [];
        }
        /*
         * Cada pastilla dice QUÉ POSICIÓN ocupa, y no se deduce del orden de
         * los hijos. Una pastilla puede no pintar ni un nodo —`FlowListOrder`
         * se carga con `dynamic` y su `loading` es `null`, y un contador en
         * cero devuelve `null`—, así que contando hijos los anchos se
         * desplazan y se le asigna a una pastilla el ancho de la de al lado.
         * Medido antes de esto: una fila de siete que cabía de sobra se
         * quedaba en seis con un «+1», porque el ancho de la última no se
         * llegaba a medir nunca.
         */
        for (const n of nodo.querySelectorAll<HTMLElement>(":scope > [data-pastilla]")) {
            const i = Number(n.dataset.pastilla);
            if (Number.isInteger(i) && i >= 0) m.anchos[i] = n.offsetWidth;
        }
        for (const n of nodo.querySelectorAll<HTMLElement>(":scope > [data-pastilla-fija]")) {
            const j = Number(n.dataset.pastillaFija);
            if (Number.isInteger(j) && j >= 0) m.fijas[j] = n.offsetWidth;
        }
        const mas = nodo.querySelector<HTMLElement>(":scope > [data-pastilla-mas]");
        if (mas) m.mas = mas.offsetWidth;

        const visibles = repartirLasPastillas(
            // Con `Array.from` y no `slice`: un array corto se leería como
            // «hay menos pastillas» en vez de como «falta una medida», y el
            // reparto escondería lo que ni siquiera se llegó a medir.
            Array.from({ length: total }, (_, i) => m.anchos[i]),
            Array.from({ length: fijas }, (_, j) => m.fijas[j]),
            // De partida, lo que mide una contadora: el «+N» es una de ellas.
            // Es solo el punto de arranque y no decide nada — en cuanto el
            // «+N» existe se mide de verdad y el reparto converge, y cuando no
            // existe es porque caben todas, que se contesta sin mirar su ancho.
            Number.isFinite(m.mas) ? m.mas : ANCHO_DE_LA_CONTADORA_PX,
            nodo.clientWidth,
        );
        setReparto((antes) =>
            antes.firma === firma && antes.visibles === visibles ? antes : { firma, visibles },
        );
    }, [firma, total, fijas]);

    const ultimaMedida = useRef(medir);
    ultimaMedida.current = medir;

    /*
     * Se mide en CADA pintado, y antes de pintar.
     *
     * Antes de pintar porque una fila que naciera con todas puestas y se
     * repartiera después se vería saltar. Y en cada pintado porque lo que
     * cambia el ancho de una pastilla no siempre cambia la firma: el nombre de
     * la etapa, el rótulo de la calificación, las iniciales del asesor. La
     * fila está memoizada, así que esto solo corre cuando de verdad cambian
     * sus datos, y lo que cuesta es una lectura de `offsetWidth` por pastilla.
     */
    useLayoutEffect(() => {
        ultimaMedida.current();
    });

    useEffect(() => {
        const nodo = renglon.current;
        if (!nodo) return;
        // El ancho del renglón cambia con la columna —el menú lateral, un
        // panel, la ventana— y eso no lo dispara ningún render de la fila.
        const soltar = observarElAncho(nodo, () => ultimaMedida.current());
        /*
         * Y la LETRA cambia sin que cambie nada más: el primer pintado sale con
         * la fuente de respaldo y Poppins llega después, así que las pastillas
         * de texto miden otra cosa. Sin esto, el reparto se quedaba con los
         * anchos de Arial para el resto de la vida de la fila —medido: una fila
         * de siete que cabía de sobra salía con un «+1»—, y no hay render ni
         * cambio de tamaño del renglón que lo despierte.
         */
        let vigente = true;
        void document.fonts?.ready
            .then(() => {
                if (vigente) ultimaMedida.current();
            })
            .catch(() => {});
        return () => {
            vigente = false;
            soltar();
        };
    }, []);

    return { renglon, visibles: seVen };
}
