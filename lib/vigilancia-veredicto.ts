import { UNA_CARGA_MALA_MS, type DiaVigilado } from "@/lib/vigilancia-de-chats";

/**
 * Decide si un dia merece un aviso. **Puro**: entran filas, sale un veredicto.
 *
 * Que sea puro es lo unico que permite demostrar lo que mas importa aqui: que
 * **esta callado cuando todo va bien**. Un vigilante que avisa de mas se ignora
 * a la semana, y entonces no vigila nada.
 */

/** Por debajo de esto, un dia no dice nada: una carga con mala suerte no avisa. */
const CARGAS_MINIMAS_PARA_JUZGAR = 3;

/** Cuantas de las cargas del dia tienen que ser malas para que cuente. */
const PROPORCION_DE_MALAS = 0.25;

/**
 * Cuanto tiene que empeorar una cuenta respecto de SI MISMA.
 *
 * Esto es lo que atrapa la degradacion lenta, que es el caso que de verdad
 * preocupa: pasar de 1,8 s a 3,5 s **no cruza el umbral de los 4 s** y aun asi
 * es que algo se rompio. El umbral absoluto solo, por si mismo, no se entera
 * hasta que ya duele.
 */
const CUANTO_PEOR_QUE_SU_COSTUMBRE = 2;

/**
 * Y un suelo, para no avisar de que 300 ms pasaron a 700.
 *
 * Doblar un numero pequeño es ruido: nadie nota la diferencia y el aviso sobra.
 */
const SUELO_PARA_MIRAR_LA_COSTUMBRE_MS = 2000;

/** Cuantos dias de atras definen "su costumbre". */
const DIAS_DE_COSTUMBRE = 14;

export type CuentaSeñalada = {
  userId: string;
  cargas: number;
  malas: number;
  mediaMs: number;
  peorMs: number;
  /** Su media habitual, cuando hay con que compararla. */
  suCostumbreMs: number | null;
  /** En palabras, para el WhatsApp. */
  porQue: string;
  peorDetalle: Record<string, number | null> | null;
};

export type Veredicto =
  | { hayQueAvisar: false; motivo: "todo bien" | "sin datos suficientes" }
  | { hayQueAvisar: true; motivo: "el vigilante no escribio"; cuentas: [] }
  | { hayQueAvisar: true; motivo: "cuentas degradadas"; cuentas: CuentaSeñalada[] };

/**
 * @param elDia      el dia que se juzga, normalmente ayer (`YYYY-MM-DD`).
 * @param historial  todas las filas leidas, incluido `elDia`.
 */
export function juzgarElDia(elDia: string, historial: DiaVigilado[]): Veredicto {
  const deEseDia = historial.filter((f) => f.dia === elDia);
  const huboAntes = historial.some((f) => f.dia < elDia);

  // Ni una fila en todo el dia, habiendolas habido antes. No es "todo bien":
  // es que nadie abrio Chats o que **el vigilante dejo de escribir**, y las dos
  // cosas hay que mirarlas. Sin historial previo no se puede distinguir de un
  // estreno, asi que ahi se calla.
  if (!deEseDia.length) {
    return huboAntes
      ? { hayQueAvisar: true, motivo: "el vigilante no escribio", cuentas: [] }
      : { hayQueAvisar: false, motivo: "sin datos suficientes" };
  }

  const señaladas: CuentaSeñalada[] = [];

  for (const fila of deEseDia) {
    if (fila.cargas < CARGAS_MINIMAS_PARA_JUZGAR) continue;

    const costumbre = suCostumbre(fila.userId, elDia, historial);
    const motivos: string[] = [];

    if (fila.mediaMs > UNA_CARGA_MALA_MS) {
      motivos.push(`su carga normal tarda ${enSegundos(fila.mediaMs)}`);
    }
    if (fila.malas / fila.cargas >= PROPORCION_DE_MALAS) {
      const pct = Math.round((fila.malas / fila.cargas) * 100);
      motivos.push(`${pct}% de las cargas pasaron de ${enSegundos(UNA_CARGA_MALA_MS)}`);
    }
    if (
      costumbre !== null &&
      fila.mediaMs >= SUELO_PARA_MIRAR_LA_COSTUMBRE_MS &&
      fila.mediaMs >= costumbre * CUANTO_PEOR_QUE_SU_COSTUMBRE
    ) {
      motivos.push(`va al doble de su costumbre (${enSegundos(costumbre)})`);
    }

    if (!motivos.length) continue;

    señaladas.push({
      userId: fila.userId,
      cargas: fila.cargas,
      malas: fila.malas,
      mediaMs: fila.mediaMs,
      peorMs: fila.peorMs,
      suCostumbreMs: costumbre,
      porQue: motivos.join("; "),
      peorDetalle: fila.peorDetalle,
    });
  }

  if (!señaladas.length) return { hayQueAvisar: false, motivo: "todo bien" };

  // La peor primero: si el aviso se lee a medias, que lo primero sea lo gordo.
  señaladas.sort((a, b) => b.mediaMs - a.mediaMs);
  return { hayQueAvisar: true, motivo: "cuentas degradadas", cuentas: señaladas };
}

/**
 * La media habitual de esa cuenta en los dias ANTERIORES.
 *
 * La **mediana** de sus medias, no la media de las medias: un solo dia malo
 * -un despliegue, un corte de Evolution- subiria la media y a partir de ahi
 * "su costumbre" seria ya mala, que es como un vigilante se acostumbra a lo
 * roto y deja de avisar.
 */
function suCostumbre(
  userId: string,
  elDia: string,
  historial: DiaVigilado[],
): number | null {
  const suyos = historial
    .filter((f) => f.userId === userId && f.dia < elDia && f.cargas >= CARGAS_MINIMAS_PARA_JUZGAR)
    .sort((a, b) => (a.dia < b.dia ? 1 : -1))
    .slice(0, DIAS_DE_COSTUMBRE)
    .map((f) => f.mediaMs)
    .sort((a, b) => a - b);

  // Con menos de tres dias no hay costumbre que valga; se juzga solo por el
  // umbral absoluto.
  if (suyos.length < 3) return null;
  const medio = Math.floor(suyos.length / 2);
  return suyos.length % 2 ? suyos[medio] : Math.round((suyos[medio - 1] + suyos[medio]) / 2);
}

function enSegundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** El texto del WhatsApp. Aparte, para poder leerlo en una prueba. */
export function redactarElAviso(
  elDia: string,
  veredicto: Veredicto,
  nombrePorCuenta: Map<string, string>,
): string | null {
  if (!veredicto.hayQueAvisar) return null;

  if (veredicto.motivo === "el vigilante no escribio") {
    return (
      `*Vigilancia de Chats* — ${elDia}\n\n` +
      `No se anoto ni una carga en todo el dia, y los dias anteriores si.\n\n` +
      `O nadie abrio Chats, o la vigilancia dejo de escribir. Lo segundo se ` +
      `parece a "todo bien" y no lo es.`
    );
  }

  const lineas = veredicto.cuentas.map((c) => {
    const nombre = nombrePorCuenta.get(c.userId) ?? c.userId;
    const detalle = pistaDelDetalle(c.peorDetalle);
    return (
      `• *${nombre}*\n` +
      `  ${c.porQue}\n` +
      `  ${c.cargas} cargas, peor ${enSegundos(c.peorMs)}` +
      (detalle ? `\n  lo que mas tardo: ${detalle}` : "")
    );
  });

  return (
    `*Vigilancia de Chats* — ${elDia}\n\n` +
    `${veredicto.cuentas.length} cuenta${veredicto.cuentas.length > 1 ? "s" : ""} ` +
    `por encima de lo normal:\n\n${lineas.join("\n\n")}\n\n` +
    `El detalle de los ultimos 30 dias esta en Analiticas.`
  );
}

/** Cual de los trozos medidos se llevo el tiempo, para no empezar a ciegas. */
function pistaDelDetalle(detalle: Record<string, number | null> | null): string | null {
  if (!detalle) return null;
  const nombres: Record<string, string> = {
    listaMs: "la lista",
    bootstrapMs: "el arranque",
    precargaProntoMs: "la precarga de entrada",
    precargaTardeMs: "el precalentado",
  };
  const partes = Object.entries(nombres)
    .map(([clave, nombre]) => ({ nombre, ms: detalle[clave] }))
    .filter((p): p is { nombre: string; ms: number } => typeof p.ms === "number");
  if (!partes.length) return null;
  const peor = partes.sort((a, b) => b.ms - a.ms)[0];
  return `${peor.nombre} (${enSegundos(peor.ms)})`;
}
