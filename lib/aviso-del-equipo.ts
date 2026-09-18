/**
 * Cuándo suena el chat del equipo, y con qué.
 *
 * Puro a propósito: la parte de navegador —WebAudio, los avisos del sistema,
 * el reloj— no se prueba sin navegador, pero **a qué se le hace caso** sí, y es
 * justo lo que no puede equivocarse. Sonar de más enseña a ignorar el sonido, y
 * entonces el que importa se ignora también — que es el mismo fallo del que
 * viene la ventana que interrumpe.
 */

/** Por qué algo merece sonar. Nunca por nada más. */
export type MotivoDelAviso = "directo" | "mencion";

/** Una cosa sin leer que PUEDE sonar. La decide el servidor. */
export type AvisoDelEquipo = {
    canalId: string;
    /** Del mensaje más nuevo que lo provoca, en milisegundos. */
    cuando: number;
    motivo: MotivoDelAviso;
};

/**
 * El tono del equipo, y por qué NO es el de los chats de clientes.
 *
 * El de clientes (`playNotificationSound`, en `hooks/chats/useAdvisorNotifications`)
 * va de 880 a 1100 Hz y dura 450 ms. Este va **más agudo y la mitad de corto**,
 * y con MENOS volumen, no más: dos tonos que compiten por ser el más fuerte
 * acaban los dos apagados.
 *
 * Lo que distingue un aviso de otro es el **timbre**, no los decibelios. Un
 * mensaje de un cliente es dinero esperando; uno del equipo es un compañero: se
 * reconoce sin levantar la vista y sin asustar a nadie.
 */
export const TONO_DEL_EQUIPO = {
    /** De dónde a dónde sube. Por encima del de clientes, que acaba en 1100. */
    desde: 1_320,
    hasta: 1_760,
    /** Cuánto dura, en segundos. La mitad que el de clientes. */
    duracion: 0.18,
    /** A qué volumen. Por debajo del 0.25 de clientes, a propósito. */
    volumen: 0.14,
} as const;

/**
 * Ni dos seguidos ni diez en una ráfaga.
 *
 * Con un canal activo entran mensajes de dos en dos, y una vuelta del reloj
 * puede traer varios de golpe. **Suena UNA vez por vuelta** —eso ya lo da
 * elegir el más nuevo— y además no se repite dentro de este rato, para que una
 * conversación viva no se convierta en una alarma.
 */
export const SILENCIO_ENTRE_AVISOS_MS = 4_000;

/**
 * Qué merece sonar, de todo lo que llega.
 *
 * Tres condiciones, y cada una está por algo distinto:
 *
 * 1. **Un directo, o una mención.** Un mensaje del general sin mención NO suena
 *    nunca: es el canal donde está todo el mundo, y sonar con cada cosa que se
 *    dice ahí es exactamente lo que hace que se silencie el aviso entero.
 * 2. **No el canal que se tiene delante.** Y «delante» son las dos cosas: el
 *    panel abierto en ese canal **y** la pestaña a la vista. Con la pestaña de
 *    fondo el canal sigue «abierto» en la pantalla y no lo está viendo nadie,
 *    que es justo cuando hay que sonar.
 * 3. **Más nuevo que lo último que ya sonó.** Es lo que impide que la misma
 *    mención suene en cada vuelta mientras siga sin leer.
 *
 * Lo propio no entra aquí porque no llega: lo descarta el servidor, que no
 * cuenta como sin leer lo que uno mismo escribió.
 */
/**
 * Qué cuenta como una fila de verdad.
 *
 * Lo miran **las dos** funciones de abajo, y ahí está el motivo de que sea una
 * función y no dos condiciones copiadas: el banco cazó que sin esto una fila
 * rota —sin canal— no sonaba pero **sí empujaba la marca**, y entonces se
 * tragaba en silencio todos los avisos buenos que llegaran después con una hora
 * menor. Dos funciones que deciden sobre la misma lista tienen que estar de
 * acuerdo en qué es esa lista.
 */
function esUnAviso(a: AvisoDelEquipo | null | undefined): a is AvisoDelEquipo {
    return Boolean(a && a.canalId) && Number.isFinite(a?.cuando);
}

export function loQueMereceSonar(
    avisos: AvisoDelEquipo[],
    entorno: {
        /** El canal abierto en el panel, o `null` si no hay panel abierto. */
        canalAbierto: string | null;
        /** Si la pestaña está a la vista ahora mismo. */
        aLaVista: boolean;
        /** Lo último que ya sonó, en ms. `0` la primera vez. */
        marca: number;
    },
): AvisoDelEquipo | null {
    const delante = entorno.aLaVista ? entorno.canalAbierto : null;

    let mejor: AvisoDelEquipo | null = null;
    for (const a of avisos) {
        if (!esUnAviso(a)) continue;
        if (a.cuando <= entorno.marca) continue;
        if (delante && a.canalId === delante) continue;
        if (!mejor || a.cuando > mejor.cuando) mejor = a;
    }
    return mejor;
}

/**
 * La marca nueva después de una vuelta, suene o no.
 *
 * **Avanza aunque no suene**, y esa es la parte que no es obvia: lo que se
 * descarta por tenerlo delante ya está visto, así que dejarlo detrás de la
 * marca haría que sonara al cambiar de canal. La marca dice «hasta aquí ya lo
 * sé», no «hasta aquí ya sonó».
 *
 * Y nunca retrocede: una respuesta que llega tarde, de una vuelta anterior, no
 * puede resucitar avisos que ya se dieron por vistos.
 */
export function laMarcaDespues(avisos: AvisoDelEquipo[], marca: number): number {
    let mayor = marca;
    for (const a of avisos) {
        if (esUnAviso(a) && a.cuando > mayor) mayor = a.cuando;
    }
    return mayor;
}

/** La llave de lo ya sonado. Por PERSONA: dos cuentas en el mismo navegador no se pisan. */
export function llaveDeLaMarca(personaId: string): string {
    return `equipo_ya_sono_${personaId || "sin-persona"}`;
}

/**
 * A quién se le EMPUJA un aviso con la plataforma cerrada.
 *
 * Es **la misma pregunta que el sonido**, del lado del servidor: un directo, o
 * una mención en cualquier canal, el general incluido. Un mensaje del general
 * sin mención no empuja a nadie — es el canal donde está todo el mundo, y
 * avisar con cada cosa que se dice ahí es exactamente lo que enseña a despachar
 * los avisos sin leerlos, con lo que el que importa se pierde también.
 *
 * Y está **aquí**, al lado de `loQueMereceSonar`, a propósito: son la misma
 * regla contada dos veces —una en el navegador, otra en el servidor— y con el
 * texto copiado en dos ficheros el día que se afine una, la otra se queda
 * atrás. Eso no se ve como un error: se ve como «a veces suena y no llega el
 * aviso», que es de lo más difícil de diagnosticar.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Nunca al autor.** Lo que uno escribe no le avisa a él. En el sonido lo
 *    descarta el servidor al contar lo sin leer; aquí hay que descontarlo a
 *    mano, porque el autor puede estar en los miembros y en los mencionados.
 * 2. **De un directo se avisa a los miembros**, no a quien lo pueda leer: quien
 *    administra lee los directos de su cuenta, y empujarle el tráfico de todo
 *    el mundo al teléfono es tanto como no tener avisos.
 * 3. **Sin repetidos.** La misma persona puede ser miembro del directo y estar
 *    mencionada dentro; sale un aviso, no dos.
 */
export function aQuienSeLeEmpuja(input: {
    /** Qué clase de canal es. Solo un directo avisa sin mención. */
    tipo: "general" | "area" | "directo";
    /** Los miembros del canal. En un directo son exactamente dos. */
    miembros: string[];
    /** Quién escribió. Nunca recibe. */
    autorId: string;
    /** A quién se mencionó, ya decidido por el servidor sobre la gente del canal. */
    mencionados: string[];
}): string[] {
    const fuera = new Set<string>();
    const salen: string[] = [];

    const sumar = (id: string) => {
        const limpio = (id ?? "").trim();
        if (!limpio) return;
        if (limpio === input.autorId) return;
        if (fuera.has(limpio)) return;
        fuera.add(limpio);
        salen.push(limpio);
    };

    if (input.tipo === "directo") {
        for (const id of input.miembros) sumar(id);
    }
    for (const id of input.mencionados) sumar(id);

    return salen;
}

/**
 * Cuánto del mensaje entra en un aviso del sistema.
 *
 * Se recorta y **se dice que se recortó**: un aviso cortado en seco parece el
 * mensaje entero, y quien lo lee actúa sobre medio texto. Los saltos de línea
 * se aplastan porque un aviso del sistema es una línea — con ellos dentro, el
 * navegador se queda con el primer trozo y el resto no lo ve nadie.
 */
export const TOPE_DEL_TEXTO_DEL_AVISO = 160;

export function comoTextoDeAviso(texto: string): string {
    const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
    if (limpio.length <= TOPE_DEL_TEXTO_DEL_AVISO) return limpio;
    return `${limpio.slice(0, TOPE_DEL_TEXTO_DEL_AVISO - 1)}…`;
}
