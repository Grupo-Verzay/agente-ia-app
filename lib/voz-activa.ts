/**
 * Quién está hablando, para poner a esa persona en grande.
 *
 * Puro a propósito: **medir el sonido** necesita un navegador —un
 * `AnalyserNode` por cada stream— pero **decidir a quién se pone en grande** no,
 * y es lo único de esto que se puede equivocar de forma visible. Lo mide
 * `hooks/useVozActiva`; lo decide esto.
 *
 * # Por qué no basta con «el más alto de esta vuelta»
 *
 * Porque el más alto cambia diez veces por segundo. Con el recuadro grande
 * atado directamente a esa medida, la reunión se convierte en un estrobo: una
 * tos, una silla que se mueve o el silencio entre dos frases bastan para que el
 * recuadro grande salte a otra persona y vuelva. Y eso no se lee como una
 * función que funciona: se lee como que la pantalla parpadea sola.
 *
 * Así que la decisión lleva **tres frenos**, y los tres hacen falta:
 *
 * 1. **Un suelo** (`NIVEL_MINIMO`). Por debajo de él no es voz, es el ruido de
 *    la habitación. Sin suelo, en una reunión en silencio el recuadro grande
 *    iría saltando entre quien tenga el micro más sensible.
 * 2. **Un rato mínimo en el sitio** (`MINIMO_EN_GRANDE_MS`). Quien acaba de
 *    ponerse en grande se queda ahí aunque otro suba un instante: hace falta
 *    que la otra persona hable **de verdad** para desbancarle.
 * 3. **Una ventaja clara** (`VENTAJA_PARA_CAMBIAR`). No gana quien esté un pelo
 *    por encima: gana quien esté sensiblemente por encima. Dos personas
 *    hablando a la vez con volúmenes parecidos dejan el recuadro quieto en vez
 *    de repartírselo a cachos.
 *
 * # Y en silencio NO se vacía
 *
 * Cuando nadie habla se **conserva** a quien hablaba. Es lo contrario de lo
 * obvio y es lo correcto: entre dos frases de la misma persona hay medio
 * segundo de silencio, y vaciar el recuadro grande ahí lo dejaría parpadeando
 * en cada coma. Quien acaba de hablar es, además, a quien se está mirando.
 */

/**
 * Por debajo de esto no se considera que alguien hable.
 *
 * Es un RMS normalizado (0 a 1) sobre la señal del micro, no decibelios. El
 * número sale de lo que mide un micro de portátil: el silencio de una
 * habitación se queda por debajo de 0,01 y una voz normal pasa de 0,05 con
 * holgura. Subirlo deja fuera a quien habla bajo; bajarlo mete el ventilador.
 */
export const NIVEL_MINIMO = 0.02;

/**
 * Cuánto se queda como mínimo en grande quien acaba de llegar ahí.
 *
 * Un segundo y medio: lo bastante para que una frase corta no lo pierda, y lo
 * bastante poco para que una conversación de ida y vuelta siga al que habla.
 */
export const MINIMO_EN_GRANDE_MS = 1_500;

/**
 * Cuánto más alto hay que estar para desbancar a quien está en grande.
 *
 * Una vez y media. Con un margen más pequeño, dos personas en la misma sala
 * —o dos micros parecidos— se turnan el recuadro grande cada pocas décimas.
 */
export const VENTAJA_PARA_CAMBIAR = 1.5;

export type NivelDeVoz = {
    /** Quién. El id de participante, el mismo con el que se pinta. */
    id: string;
    /** Cuánto suena ahora mismo, de 0 a 1. */
    nivel: number;
    /**
     * Si su micro está abierto.
     *
     * Hace falta aparte del nivel: a quien se ha silenciado le sigue llegando
     * su propia pista con silencio dentro, así que su nivel puede no ser
     * exactamente cero por el ruido de fondo del códec. Sin esta condición,
     * alguien callado podría ganar el recuadro grande en una sala en silencio,
     * que es exactamente lo contrario de lo que dice el recuadro.
     */
    micEncendido: boolean;
};

export type QuienHabla = {
    /** A quién se pone en grande. `null` solo si no hay nadie. */
    id: string | null;
    /** Desde cuándo está ahí. Se devuelve para poder encadenar la vuelta siguiente. */
    desde: number;
};

/**
 * A quién le toca el recuadro grande en esta vuelta.
 *
 * Se le pasa **lo que decidió la vuelta anterior** y devuelve lo de esta, así
 * que es una función del estado y no guarda nada: eso es lo que permite
 * probarla entera, incluida la histéresis, sin navegador y sin relojes.
 */
export function elQueHabla(input: {
    niveles: NivelDeVoz[];
    anterior: QuienHabla;
    ahora: number;
    /** Los que siguen en la reunión. Quien se fue no puede seguir en grande. */
    presentes: string[];
}): QuienHabla {
    const { niveles, anterior, ahora, presentes } = input;
    const estan = new Set(presentes);

    // Quien se fue suelta el recuadro en el acto. No es histéresis: ya no hay
    // a quién enseñar, y conservarlo dejaría el hueco grande con un recuadro
    // negro de alguien que cerró la pestaña.
    const actual = anterior.id && estan.has(anterior.id) ? anterior.id : null;
    const desdeActual = actual === anterior.id ? anterior.desde : 0;

    const hablando = niveles
        .filter((n) => estan.has(n.id) && n.micEncendido && n.nivel >= NIVEL_MINIMO)
        .sort((a, b) => b.nivel - a.nivel);

    // Nadie habla: se CONSERVA al último. Ver la cabecera — vaciar aquí es lo
    // que hace parpadear el recuadro en cada coma.
    if (!hablando.length) {
        if (actual) return { id: actual, desde: desdeActual };
        // Y si no había ninguno, se coge al primero que esté, para que el
        // hueco grande no salga vacío nada más entrar.
        const alguno = presentes[0] ?? null;
        return alguno ? { id: alguno, desde: ahora } : { id: null, desde: ahora };
    }

    const masAlto = hablando[0];

    // Ya está en grande quien más suena: nada que hacer, y sin tocar `desde`
    // para no reiniciarle el rato mínimo en cada vuelta.
    if (actual === masAlto.id) return { id: actual, desde: desdeActual };

    // No había nadie en grande: se pone el que suena, sin más condiciones.
    if (!actual) return { id: masAlto.id, desde: ahora };

    // Los dos frenos, en este orden. Primero el tiempo —es el barato— y
    // después la ventaja, que necesita el nivel del que está.
    if (ahora - desdeActual < MINIMO_EN_GRANDE_MS) return { id: actual, desde: desdeActual };

    const elDeAhora = niveles.find((n) => n.id === actual);
    const suNivel = elDeAhora && elDeAhora.micEncendido ? elDeAhora.nivel : 0;
    if (masAlto.nivel < suNivel * VENTAJA_PARA_CAMBIAR) {
        return { id: actual, desde: desdeActual };
    }

    return { id: masAlto.id, desde: ahora };
}

/**
 * El nivel que se le saca a un bloque de muestras.
 *
 * RMS y no el pico: el pico se dispara con un golpe en la mesa y no distingue
 * una voz de un portazo. La media cuadrática es lo que de verdad se parece a
 * «cuánto está sonando esto».
 *
 * Las muestras llegan como `Uint8Array` de un `AnalyserNode`
 * (`getByteTimeDomainData`), o sea centradas en 128. Se pasa a −1..1 antes de
 * elevar al cuadrado, o el silencio —todo 128— saldría como el nivel más alto
 * posible.
 */
export function elNivelDeLasMuestras(muestras: Uint8Array | number[]): number {
    const n = muestras.length;
    if (!n) return 0;
    let suma = 0;
    for (let i = 0; i < n; i++) {
        const v = (muestras[i] - 128) / 128;
        suma += v * v;
    }
    return Math.sqrt(suma / n);
}

/**
 * Cómo se reparte la pantalla en la vista de orador.
 *
 * Las miniaturas van **al lado** cuando hay ancho y **debajo** cuando no: en un
 * móvil en vertical una columna de miniaturas a la derecha deja al orador en
 * una tira, que es justo lo que la vista de orador viene a evitar. Se devuelve
 * la clase entera y no un booleano para que las dos cosas que dependen de ella
 * —la dirección del contenedor y el tamaño de la tira— no puedan discrepar.
 */
export function laTiraDeMiniaturas(cuantas: number): {
    contenedor: string;
    tira: string;
} {
    if (cuantas <= 0) return { contenedor: "flex-col", tira: "hidden" };
    return {
        // Debajo en estrecho, a la derecha desde `sm`.
        contenedor: "flex-col sm:flex-row",
        // Alto fijo abajo / ancho fijo al lado: la tira no puede comerse al
        // orador, que es el motivo de esta vista.
        tira: "h-20 w-full shrink-0 flex-row sm:h-full sm:w-36 sm:flex-col md:w-44",
    };
}
