/**
 * Actividad de instancias: si una línea está VIVA, no si está conectada.
 *
 * Conexiones ya dice si el QR está enlazado y si el Robot está encendido. Las
 * dos cosas pueden estar en verde y la línea no contestar nada: el webhook no
 * llega, la sesión de Waha está colgada, el número está baneado. Desde fuera
 * eso se ve como «la IA dejó de responder» y hoy hay que entrar cuenta por
 * cuenta para encontrarlo.
 *
 * Lo que dice esto es lo único que no se puede fingir: **si pasaron mensajes**.
 *
 * ## Los tres estados, y por qué en este orden
 *
 * - **rojo** — no entró ni un mensaje en la ventana. Es lo más grave: una
 *   línea por la que no pasa nada no se distingue de una apagada, y si además
 *   el cliente cree que está atendiendo, está perdiendo conversaciones ahora
 *   mismo.
 * - **amarillo** — entran mensajes y la IA no contestó ninguno. La línea vive
 *   —el webhook llega— pero el agente no. O está pausado a propósito, o está
 *   roto, y la columna de mensajes escritos por personas es justo lo que
 *   separa un caso del otro: con gente contestando es una línea atendida a
 *   mano; sin nadie, es una conversación que se quedó sin responder.
 * - **verde** — entran mensajes y la IA contesta. No se lista: una tabla que
 *   enseña lo que va bien esconde lo que va mal entre cincuenta filas sanas.
 *
 * ## Es puro a propósito
 *
 * Entra lo que devolvió la consulta y sale la clasificación. Así el criterio
 * —qué es rojo, qué es amarillo, en qué orden— se puede comprobar sin base de
 * datos, y la consulta no tiene que saber nada de colores.
 */

/** Cuántos días se miran. Es la ventana del encargo y sale en el rótulo. */
export const DIAS_DE_ACTIVIDAD = 7;

/** Una línea con lo que pasó por ella en la ventana. Lo que devuelve la consulta. */
export type LineaConActividad = {
    userId: string;
    /** El nombre técnico de la instancia. Es la llave, no el rótulo. */
    instanceName: string;
    /** Lo que se enseña de la línea: su nombre puesto a mano, o el técnico. */
    nombreDeLinea: string;
    /** La cuenta dueña de la línea, ya resuelta a nombre o correo. */
    nombreDeCuenta: string;
    /** Mensajes que ENTRARON (`fromMe = false`). */
    recibidos: number;
    /** Salientes con la marca del agente (`raw.sentByAi`). */
    respuestasIa: number;
    /** Salientes sin esa marca. Ver la advertencia de `leerLaActividadDeInstancias`. */
    escritosPorHumanos: number;
};

export type EstadoDeLinea = "verde" | "amarillo" | "rojo";

export type LineaJuzgada = LineaConActividad & { estado: EstadoDeLinea };

export type VistaDeLaActividad = {
    lineas: LineaConActividad[];
};

export type ResumenDeActividad = {
    verdes: number;
    amarillas: number;
    rojas: number;
    /** Solo las rojas y las amarillas, ya ordenadas. Las verdes no se listan. */
    señaladas: LineaJuzgada[];
    /** Cuántas líneas se miraron en total. Sin esto, «0 rojas» no se distingue de «0 líneas». */
    total: number;
};

/**
 * El estado de una línea.
 *
 * El orden de las dos preguntas importa y no es intercambiable: sin mensajes
 * recibidos **no se puede juzgar a la IA**, porque no tenía a qué contestar.
 * Preguntando primero por la IA, una línea muerta saldría amarilla —«recibió y
 * no contestó»— que es exactamente lo contrario de lo que pasa.
 */
export function estadoDeLaLinea(linea: LineaConActividad): EstadoDeLinea {
    if (linea.recibidos === 0) return "rojo";
    if (linea.respuestasIa === 0) return "amarillo";
    return "verde";
}

/** Primero las rojas. Dentro de cada color, la que más tráfico mueve. */
const GRAVEDAD: Record<EstadoDeLinea, number> = { rojo: 0, amarillo: 1, verde: 2 };

/**
 * Los tres conteos y la lista de las que hay que mirar.
 *
 * Dentro de un mismo color manda el volumen: entre dos líneas amarillas, la
 * que dejó cien mensajes sin responder es más urgente que la que dejó dos. Y
 * entre dos rojas —las dos con cero recibidos— decide el nombre, para que la
 * lista no baile de una carga a otra sin que nada haya cambiado.
 */
export function resumirLaActividad(lineas: LineaConActividad[]): ResumenDeActividad {
    const juzgadas: LineaJuzgada[] = lineas.map((l) => ({ ...l, estado: estadoDeLaLinea(l) }));

    const señaladas = juzgadas
        .filter((l) => l.estado !== "verde")
        .sort((a, b) => {
            const porColor = GRAVEDAD[a.estado] - GRAVEDAD[b.estado];
            if (porColor !== 0) return porColor;
            if (b.recibidos !== a.recibidos) return b.recibidos - a.recibidos;
            return a.nombreDeCuenta.localeCompare(b.nombreDeCuenta, "es");
        });

    return {
        verdes: juzgadas.filter((l) => l.estado === "verde").length,
        amarillas: juzgadas.filter((l) => l.estado === "amarillo").length,
        rojas: juzgadas.filter((l) => l.estado === "rojo").length,
        señaladas,
        total: juzgadas.length,
    };
}
