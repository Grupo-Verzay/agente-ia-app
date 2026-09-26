import { useCallback, useEffect, useRef, useState } from 'react';

export interface MessageRecord {
  /**
   * Qué chat, y en qué línea: `<instancia>::<remoteJid>`.
   *
   * Antes era solo el remoteJid. Un mismo contacto que escribe a dos líneas
   * —y sobre todo un `@lid`, que se repite entre líneas— compartía una única
   * marca: abrir el chat en una borraba la marca de la otra, y las dos se
   * pisaban sin parar. El nombre del campo se queda por los registros ya
   * guardados en los navegadores.
   */
  userId: string;
  messageId: string;
  /**
   * Fecha del último mensaje visto, en milisegundos.
   *
   * El id exacto no bastaba: Evolution cambia el último mensaje de un chat por
   * cosas que no son un mensaje nuevo (un acuse, una edición), y al no coincidir
   * el id la conversación volvía a marcarse sin leer. Con la fecha, se considera
   * leído todo lo que no sea posterior a lo que ya se abrió.
   */
  ts?: number;
}

/** Lo que se recuerda de cada chat abierto, por su llave. */
export type ChatsVistos = ReadonlyMap<string, MessageRecord>;

/** Lo que se espera a que pare la ráfaga antes de escribir en el disco. */
const ESPERA_ANTES_DE_GUARDAR = 800;

/**
 * Qué chats ya se abrieron, guardado en el navegador.
 *
 * # Por qué es un Map y no una lista
 *
 * Era una lista y se buscaba en ella con `.find()`, o sea recorriéndola entera.
 * Y no se busca una vez: se busca **una vez por cada chat de la bandeja**, en
 * la pasada que decide cuáles salen sin leer. Con el tope de 1.000 entradas y
 * una cuenta de 3.900 chats eso son millones de comparaciones de cadena por
 * pasada, y la pasada se rehace en cada clic, en cada vuelta de la lista y en
 * cada tanda de tiempo real.
 *
 * Eso es exactamente lo que se notaba: la bandeja arranca ágil por la mañana y
 * se va poniendo pastosa según avanza el día, porque la lista crece con cada
 * chat que se abre y **nada la vacía nunca**. Con un Map cada consulta es una
 * sola búsqueda, valga 10 o 1.000 lo guardado.
 *
 * # Lo que NO cambia
 *
 * 1. **En el disco se sigue guardando la MISMA lista.** El Map es solo la forma
 *    en memoria. Así no hay nada que migrarle a nadie —lo que los asesores ya
 *    tienen guardado se lee tal cual— y un navegador que vuelva a una versión
 *    anterior sigue entendiendo lo suyo.
 * 2. **El tope se poda por posición**, como siempre: entran 1.000 y se va la
 *    más antigua. Un Map conserva el orden de inserción, así que basta con
 *    quitar por delante. Y volver a marcar un chat lo manda al final —se borra
 *    y se vuelve a poner—, igual que hacía el `filter` + añadir de antes: sin
 *    eso, un chat que se abre a diario podría caerse del tope.
 * 3. **Entre entradas repetidas gana la PRIMERA**, que es lo que devolvía
 *    `.find()`. En condiciones normales no las hay —se borra la anterior antes
 *    de escribir—, pero lo que ya está guardado en los navegadores de la gente
 *    no lo decide este código, y una entrada repetida no puede cambiarle a
 *    nadie un chat de leído a sin leer.
 *
 * # Y se escribe con retardo
 *
 * Antes se serializaba y se escribía en cada cambio, o sea en cada chat que se
 * abre: ~60-70 KB convertidos a texto y guardados de forma síncrona, con el
 * hilo parado mientras tanto. Ahora se junta la ráfaga y se escribe una vez,
 * más un volcado al ocultar la pestaña para no perder lo último.
 */
export function useChatsVistos(
  key: string,
): [ChatsVistos, (cambiar: (previo: ChatsVistos) => Map<string, MessageRecord>) => void] {
  // Se arranca vacío en servidor y en cliente para que el primer pintado sea el
  // mismo en los dos y React no se queje de hidratación. Lo guardado se carga
  // justo después.
  const [vistos, setVistos] = useState<ChatsVistos>(() => new Map());

  /**
   * Hasta que no se ha leído lo guardado, NO se escribe.
   *
   * Sin esto, cualquier volcado anterior a la carga —desmontar la pantalla,
   * cambiar de pestaña del navegador, el doble montaje de React en
   * desarrollo— guardaría el Map vacío del primer pintado encima de lo que el
   * asesor tenía, y le dejaría toda la bandeja sin leer de golpe.
   */
  const cargado = useRef(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(key);
      if (!guardado) return;
      const lista = JSON.parse(guardado) as MessageRecord[];
      if (!Array.isArray(lista)) return;

      const mapa = new Map<string, MessageRecord>();
      for (const registro of lista) {
        // Gana la primera, no la última: `new Map(lista.map(...))` se habría
        // quedado con la última y eso no es lo que hacía `.find()`.
        if (registro?.userId && !mapa.has(registro.userId)) mapa.set(registro.userId, registro);
      }
      setVistos(mapa);
    } catch (error) {
      console.warn(`[chats] no se pudo leer "${key}" del navegador`, String(error));
    } finally {
      cargado.current = true;
    }
  }, [key]);

  // Lo último, para poder volcarlo desde el temporizador y al ocultar la
  // pestaña sin que esos manejadores dependan del estado y se rehagan.
  const ultimo = useRef<ChatsVistos>(vistos);
  useEffect(() => {
    ultimo.current = vistos;
  }, [vistos]);

  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const volcar = useCallback(() => {
    if (pendiente.current) {
      clearTimeout(pendiente.current);
      pendiente.current = null;
    }
    if (!cargado.current) return;
    try {
      localStorage.setItem(key, JSON.stringify([...ultimo.current.values()]));
    } catch (error) {
      // Puede fallar de verdad —ventana privada, almacenamiento lleno o
      // bloqueado—. Mudo no: lo que se pierde es qué chats se habían leído, y
      // desde fuera eso se ve como una bandeja que se reinventa los no leídos.
      console.warn(`[chats] no se pudo guardar "${key}" en el navegador`, String(error));
    }
  }, [key]);

  const cambiarVistos = useCallback(
    (cambiar: (previo: ChatsVistos) => Map<string, MessageRecord>) => {
      setVistos(cambiar);
      if (pendiente.current) clearTimeout(pendiente.current);
      pendiente.current = setTimeout(volcar, ESPERA_ANTES_DE_GUARDAR);
    },
    [volcar],
  );

  // Cerrar la pestaña o irse a otra aplicación no puede llevarse lo de la
  // ráfaga en curso. `visibilitychange` es el único que dispara de forma fiable
  // en móvil, donde `beforeunload` a menudo no llega.
  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') volcar();
    };
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', volcar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', volcar);
      volcar();
    };
  }, [volcar]);

  return [vistos, cambiarVistos];
}

/**
 * El corte de cada línea: hasta dónde se da por leído lo que YA ESTABA.
 *
 * Vive al lado de `seenMessages` y en el mismo sitio —el `localStorage` de este
 * navegador— porque contesta la otra mitad de la misma pregunta: aquel dice qué
 * chats se abrieron, y este qué había en la bandeja antes de que esta pestaña
 * empezara a mirar. El porqué entero está en `lib/no-leido-de-la-fila.ts`.
 *
 * Es mucho más simple que su vecino y eso es a propósito: **una entrada por
 * línea, y se escribe una sola vez por línea** —la primera vuelta con chats
 * delante—. Sin ráfaga que juntar, así que no hace falta el retardo ni el
 * volcado al ocultar la pestaña.
 *
 * Lo que sí comparte es la guarda que de verdad importa: **hasta que no se ha
 * leído lo guardado NO se escribe**. Sin ella, el primer pintado —o el doble
 * montaje de React en desarrollo— guardaría el mapa vacío encima de los cortes
 * del asesor, y le dejaría la bandeja entera sin leer de golpe, que es justo la
 * regresión que el corte existe para evitar.
 */
export function useCortesDeLoYaLeido(key: string): {
  cortes: ReadonlyMap<string, number>;
  /**
   * Si ya se leyó lo guardado.
   *
   * No es un detalle: **hasta que esto sea cierto no se puede sembrar**. Con la
   * siembra corriendo sobre el mapa vacío del primer pintado, la línea se
   * sembraría de nuevo cada vez que se entra a Chats —y un corte que se mueve
   * tapa todo lo que haya entrado desde el anterior—.
   */
  listo: boolean;
  guardar: (nuevos: Map<string, number>) => void;
} {
  // Vacío en servidor y en cliente, para que el primer pintado sea el mismo en
  // los dos y no haya nada que hidratar.
  const [cortes, setCortes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [listo, setListo] = useState(false);
  // Lo mismo que `listo`, en un `ref`, y hacen falta los dos: el estado lo lee
  // quien pinta y el `ref` lo lee `guardar`, que es un `useCallback` con `key`
  // de dependencia. Con `listo` ahí dentro, esa función cambiaría de identidad
  // al cargar y arrastraría consigo al efecto que siembra.
  const cargado = useRef(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(key);
      if (!guardado) return;
      const filas = JSON.parse(guardado) as [string, number][];
      if (!Array.isArray(filas)) return;
      const mapa = new Map<string, number>();
      for (const fila of filas) {
        // Lo que no se entienda se deja fuera. Un corte con basura dentro
        // escondería chats sin leer, que es el lado que pierde mensajes.
        if (!Array.isArray(fila) || typeof fila[0] !== "string") continue;
        const ts = Number(fila[1]) || 0;
        if (ts > 0) mapa.set(fila[0], ts);
      }
      setCortes(mapa);
    } catch (error) {
      console.warn(`[chats] no se pudo leer "${key}" del navegador`, String(error));
    } finally {
      cargado.current = true;
      setListo(true);
    }
  }, [key]);

  const guardar = useCallback(
    (nuevos: Map<string, number>) => {
      setCortes(nuevos);
      if (!cargado.current) return;
      try {
        localStorage.setItem(key, JSON.stringify([...nuevos.entries()]));
      } catch (error) {
        // Mudo no: lo que se pierde es hasta dónde estaba leída cada línea, y
        // desde fuera eso se ve como una bandeja que se llena de rojo sola.
        console.warn(`[chats] no se pudo guardar "${key}" en el navegador`, String(error));
      }
    },
    [key],
  );

  return { cortes, listo, guardar };
}
