/**
 * El informe de lo que la IA no supo responder: cómo se lee.
 *
 * El backend guarda una fila por cada vez que la IA se quedó sin respuesta, ya
 * agrupada (`grupoId`), y aquí solo se le da forma a lo que devuelve la
 * consulta. Todo lo de este fichero es puro: entra lo que trae la base y sale
 * lo que pinta la pantalla.
 *
 * # Por qué la agrupación no se hace aquí
 *
 * Porque abrir el informe no puede gastar IA — es la condición del encargo — y
 * agrupar por significado la gasta. Así que el grupo se calcula **una vez, al
 * guardar**, y esto es un `GROUP BY`: sin coseno, sin modelo y sin esperar a
 * nadie. Si algún día hace falta reagrupar, se hace en el backend al escribir,
 * no aquí al leer.
 */

/** Los dos casos que cuentan como «no supo». Los mismos que el backend. */
export const CASOS = {
  escalo_sin_saber: "Escaló por no tener la respuesta",
  dijo_que_no_sabia: "Le dijo al cliente que no tenía ese dato",
} as const;

export type CasoSinRespuesta = keyof typeof CASOS;

/** Una fila tal y como sale de la consulta. */
export type FilaDelInforme = {
  grupoId: string | null;
  pregunta: string;
  caso: string;
  createdAt: Date | string;
};

/** Un grupo de preguntas iguales, listo para pintar. */
export type PreguntaAgrupada = {
  grupoId: string;
  /** La pregunta que abrió el grupo: la que se enseña. */
  pregunta: string;
  veces: number;
  /** Cuántas de cada caso, porque no significan lo mismo. */
  porEscalado: number;
  porNoSaber: number;
  /** La última vez que alguien la preguntó. */
  ultimaVez: Date;
  /** Las otras formas en que se preguntó lo mismo, sin repetir la principal. */
  variantes: string[];
};

function aFecha(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Junta las filas por su grupo.
 *
 * Reglas, y las tres importan:
 *
 * 1. **El texto que se enseña es el del representante**, o sea el de la fila
 *    cuyo `id` es el `grupoId`. Como la consulta no devuelve el `id`, se toma
 *    la MÁS ANTIGUA del grupo, que es la misma fila: el grupo lo abre la
 *    primera pregunta. Quedarse con la última haría que el título del grupo
 *    cambiara solo cada vez que alguien lo preguntase, y un informe cuyos
 *    textos se mueven no se puede comparar con el de la semana pasada.
 * 2. **Una fila sin grupo es su propio grupo.** Sin clave de OpenAI no hay
 *    embedding y el backend la guarda igual, sin agrupar: sale suelta, con su
 *    texto. Es mejor que perderla o que meterla en un grupo al azar.
 * 3. **Los dos casos se cuentan por separado además de juntos.** «Escaló por no
 *    saber» y «le dijo al cliente que no lo tenía» son huecos del mismo
 *    entrenamiento, pero el primero le costó la conversación a un asesor y el
 *    segundo no: sumarlos sin más esconde cuál de los dos está pasando.
 */
export function agruparLasPreguntas(filas: FilaDelInforme[]): PreguntaAgrupada[] {
  const porGrupo = new Map<string, { filas: FilaDelInforme[] }>();

  for (const fila of filas) {
    const clave = fila.grupoId ?? `suelta::${fila.pregunta}::${String(fila.createdAt)}`;
    const grupo = porGrupo.get(clave) ?? { filas: [] };
    grupo.filas.push(fila);
    porGrupo.set(clave, grupo);
  }

  const grupos: PreguntaAgrupada[] = [];
  for (const [grupoId, { filas: suyas }] of porGrupo) {
    const ordenadas = [...suyas].sort(
      (a, b) => aFecha(a.createdAt).getTime() - aFecha(b.createdAt).getTime(),
    );
    const principal = ordenadas[0];
    const variantes: string[] = [];
    for (const f of ordenadas) {
      const texto = f.pregunta.trim();
      if (texto === principal.pregunta.trim()) continue;
      if (variantes.includes(texto)) continue;
      variantes.push(texto);
    }

    grupos.push({
      grupoId,
      pregunta: principal.pregunta.trim(),
      veces: ordenadas.length,
      porEscalado: ordenadas.filter((f) => f.caso === "escalo_sin_saber").length,
      porNoSaber: ordenadas.filter((f) => f.caso === "dijo_que_no_sabia").length,
      ultimaVez: aFecha(ordenadas[ordenadas.length - 1].createdAt),
      // Un tope: un grupo de 300 no puede volcar 299 líneas en la pantalla, y
      // para reconocer el grupo bastan unas pocas.
      variantes: variantes.slice(0, 5),
    });
  }

  // De más preguntada a menos, y a igualdad la más reciente: lo que más sale y
  // sigue saliendo es lo primero que hay que añadir al entrenamiento.
  return grupos.sort(
    (a, b) => b.veces - a.veces || b.ultimaVez.getTime() - a.ultimaVez.getTime(),
  );
}

/** El titular del informe, de una sola pasada sobre lo ya agrupado. */
export function elResumenDelInforme(grupos: PreguntaAgrupada[]) {
  let veces = 0;
  let porEscalado = 0;
  for (const g of grupos) {
    veces += g.veces;
    porEscalado += g.porEscalado;
  }
  return {
    /** Cuántas veces la IA se quedó sin respuesta. */
    veces,
    /** Cuántas preguntas distintas son, que es lo accionable. */
    preguntas: grupos.length,
    /** De todas, cuántas acabaron con una persona atendiendo. */
    porEscalado,
  };
}
