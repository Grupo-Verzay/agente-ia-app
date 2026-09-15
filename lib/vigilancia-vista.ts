import type { DiaVigilado } from "@/lib/vigilancia-de-chats";

/**
 * Lo que la pantalla necesita saber de la vigilancia.
 *
 * Vive aqui y no en `actions/vigilancia-actions.ts` porque ese fichero lleva
 * `'use server'`, y **ahi solo se exportan funciones asincronas**. Un
 * `export const` pasa el build y luego revienta cada llamada del fichero en
 * produccion, con un 500 y sin nada en pantalla (ver la regla en CLAUDE.md;
 * costo la primera version entera de Carpetas). Un `export type` si podria
 * quedarse -se borra al compilar- pero estan los dos juntos porque son lo
 * mismo.
 */

/** Cuantos dias ve la pantalla. */
export const DIAS_QUE_SE_MIRAN = 30;

export type DiaConNombre = DiaVigilado & { nombre: string };

export type VistaDeLaVigilancia = {
  dias: DiaConNombre[];
  /**
   * Si hay fila de hoy.
   *
   * Su ausencia tambien informa: o nadie abrio Chats, o la vigilancia dejo de
   * escribir. La pantalla lo dice en vez de enseñar una tabla que parece sana.
   */
  hayDeHoy: boolean;
  /**
   * Las cuentas que el VEREDICTO señalo en el ultimo dia con datos, y cual fue
   * ese dia.
   *
   * Esto es lo que impide el peor fallo posible de esta funcion: **que el
   * WhatsApp avise de una cuenta y la pantalla no la enseñe**. Pasaba: una
   * cuenta que se degrada de 1,8 s a 3,6 s no cruza el umbral, asi que no tiene
   * ninguna carga "mala" y la pantalla la filtraba — justo la degradacion lenta
   * que el aviso existe para cazar. Recibias el aviso, entrabas a Analiticas, y
   * no estaba.
   *
   * Decide UNA sola cosa (`juzgarElDia`) y la pantalla la obedece. Si se vuelven
   * a separar los criterios, vuelven a decir cosas distintas.
   */
  señaladasPorElVeredicto: string[];
  elDiaJuzgado: string | null;
};

export type CuentaResumida = {
  userId: string;
  nombre: string;
  /** Su dia tipico en la ventana: la mediana de sus medias. */
  tipicoMs: number;
  peorMs: number;
  cargas: number;
  malas: number;
  diasConMalas: number;
  /** La señalo el veredicto, el mismo que decide el WhatsApp. */
  laSeñaloElAviso: boolean;
};

export type ResumenDeLaVigilancia = {
  /** Cuantas cuentas y cuantas cargas se miraron. */
  cuentas: number;
  cargas: number;
  /** El dia tipico de la plataforma. */
  tipicoMs: number;
  /**
   * Las que hay que mirar: tuvieron alguna carga mala. Ordenadas por su dia
   * tipico, la peor primero.
   */
  señaladas: CuentaResumida[];
  /** Cuantas van bien del todo. */
  sinUnaSolaMala: number;
};

/**
 * Agrupa los dias por cuenta. **Puro**: entran filas, sale el resumen.
 *
 * Aparte de la pantalla a proposito, para poder comprobar los numeros sin
 * montar React. Una pantalla que hace sus propias cuentas es una pantalla cuyos
 * numeros nadie puede verificar.
 */
export function resumirLaVigilancia(
  dias: DiaConNombre[],
  umbralMs: number,
  señaladasPorElVeredicto: string[] = [],
): ResumenDeLaVigilancia {
  const porElAviso = new Set(señaladasPorElVeredicto);
  const porCuenta = new Map<string, DiaConNombre[]>();
  for (const d of dias) {
    const suyos = porCuenta.get(d.userId);
    if (suyos) suyos.push(d);
    else porCuenta.set(d.userId, [d]);
  }

  const resumidas: CuentaResumida[] = [];
  let cargas = 0;

  for (const [userId, suyos] of porCuenta) {
    const sumaCargas = suyos.reduce((a, d) => a + d.cargas, 0);
    cargas += sumaCargas;
    resumidas.push({
      userId,
      nombre: suyos[0].nombre,
      tipicoMs: mediana(suyos.map((d) => d.mediaMs)),
      peorMs: Math.max(...suyos.map((d) => d.peorMs)),
      cargas: sumaCargas,
      malas: suyos.reduce((a, d) => a + d.malas, 0),
      diasConMalas: suyos.filter((d) => d.malas > 0).length,
      laSeñaloElAviso: porElAviso.has(userId),
    });
  }

  const señaladas = resumidas
    // `laSeñaloElAviso` primero, y no es un adorno: es lo que garantiza que
    // todo lo que llega por WhatsApp se pueda encontrar aqui.
    .filter((c) => c.laSeñaloElAviso || c.malas > 0 || c.tipicoMs > umbralMs)
    // Las del aviso arriba; entre iguales, la de peor dia tipico.
    .sort((a, b) =>
      a.laSeñaloElAviso === b.laSeñaloElAviso
        ? b.tipicoMs - a.tipicoMs
        : Number(b.laSeñaloElAviso) - Number(a.laSeñaloElAviso),
    );

  return {
    cuentas: resumidas.length,
    cargas,
    tipicoMs: mediana(dias.map((d) => d.mediaMs)),
    señaladas,
    sinUnaSolaMala: resumidas.length - señaladas.length,
  };
}

/**
 * La mediana, no la media.
 *
 * Un solo dia malo -un despliegue, un corte de Evolution- subiria la media y
 * dejaria la pantalla diciendo que todo va peor de lo que va. Es el mismo
 * criterio que usa el veredicto para "su costumbre", y tienen que coincidir: si
 * la pantalla y el aviso contaran distinto, uno de los dos mentiria.
 */
function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}
