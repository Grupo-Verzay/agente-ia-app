'use client';

import React, { createContext, useContext } from 'react';

/**
 * Los mandos que un visor quiere poner en la barra de arriba.
 *
 * El visor de PDF tiene los suyos —zoom, ajustar al ancho, ir a una página— y
 * los pintaba en una barra PROPIA, debajo de la del nombre y la descarga. Dos
 * barras para un solo documento: la de arriba medio vacía y la de abajo con
 * todo, cuando hay sitio de sobra al lado del nombre.
 *
 * Con esto, el visor **publica** sus mandos y la barra de arriba los pinta. La
 * barra no sabe nada de PDF —no le hace falta— y un visor que no tenga mandos
 * no publica nada y la barra se queda como estaba.
 *
 * `publicar` es estable: si cambiara de identidad en cada pintado, el efecto
 * del visor volvería a publicar sin parar y los dos se llamarían en bucle.
 */
interface MandosDelVisor {
  publicar: (nodo: React.ReactNode) => void;
}

const Contexto = createContext<MandosDelVisor | null>(null);

export const ProveedorDeMandos = Contexto.Provider;

/**
 * Publica unos mandos mientras el visor esté montado, y los retira al salir.
 *
 * Se llama `use…` **aunque el resto del proyecto vaya en castellano**, y no por
 * gusto: la regla `react-hooks/rules-of-hooks` solo reconoce un hook por ese
 * prefijo, y con otro nombre deja de comprobar que no se llame dentro de un
 * `if` ni detrás de un `return` —que es justo el error que puede colarse aquí,
 * porque el visor tiene una salida temprana cuando pdf.js no puede—.
 *
 * Retirarlos NO es opcional: sin eso, al cerrar el documento o pasar a una
 * imagen, la barra se quedaría con los botones del PDF anterior encima.
 */
export function useMandosDelVisor(nodo: React.ReactNode, dependencias: unknown[]) {
  const contexto = useContext(Contexto);
  const publicar = contexto?.publicar;

  React.useEffect(() => {
    if (!publicar) return;
    publicar(nodo);
    return () => publicar(null);
    // El nodo se rehace en cada pintado, así que no puede ir en las
    // dependencias: quien decide cuándo republicar es el visor, con lo que le
    // pasa (el zoom, la página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicar, ...dependencias]);
}
