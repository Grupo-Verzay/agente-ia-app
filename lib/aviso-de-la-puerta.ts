/**
 * Cuándo suena que alguien está esperando en la puerta de una reunión, y con
 * qué.
 *
 * Puro a propósito, igual que `lib/aviso-del-equipo.ts` y por el mismo motivo:
 * la parte de navegador —WebAudio, el reloj— no se prueba sin navegador, pero
 * **a qué se le hace caso** sí, y es justo lo que no puede equivocarse. Un
 * aviso que suena de más enseña a ignorarlo, y entonces el que importa se
 * ignora también.
 *
 * # Por qué hace falta
 *
 * La sala de espera era **solo visual**: una franja ámbar arriba de la
 * reunión. Con la reunión plegada a su pastilla, o con la pestaña de fondo, o
 * sencillamente mirando a quien habla, esa franja no la ve nadie — y quien
 * llamó a la puerta se queda fuera sin que nadie lo sepa. Es la misma familia
 * que *un aviso que espera es un aviso que no llega*.
 *
 * # Y por qué se REPITE
 *
 * Un pitido único se pierde igual que la franja: suena justo mientras alguien
 * habla y ya no vuelve. Lo que hace que una persona sea atendida es que el
 * aviso **siga ahí** mientras siga esperando. A cambio, es el más discreto de
 * los tres tonos del producto (ver `TONO_DE_LA_PUERTA`) y **se puede callar**,
 * porque un sonido que se repite y no se puede parar es lo que hace que se
 * silencie la pestaña entera — y entonces se pierden también los que sí
 * importan.
 */

/**
 * El tono de la puerta, y por qué NO es ninguno de los otros dos.
 *
 * | | de → a | dura | volumen |
 * | --- | --- | --- | --- |
 * | clientes (`useAdvisorNotifications`) | 880 → 1100 | 450 ms | 0.25 |
 * | equipo (`TONO_DEL_EQUIPO`) | 1320 → 1760 | 180 ms | 0.14 |
 * | **la puerta** | **660 → 495** | **120 ms ×2** | **0.10** |
 *
 * Tres decisiones, y cada una está por algo distinto:
 *
 * 1. **BAJA en vez de subir.** Los otros dos suben. Un tono descendente no se
 *    confunde con ninguno de ellos ni estando distraído, que es lo único que
 *    de verdad distingue un aviso de otro: el timbre, no los decibelios.
 * 2. **Dos golpes**, como se llama a una puerta. Uno solo se oye como un error
 *    del navegador; dos se leen como lo que son sin tener que aprenderlo.
 * 3. **El más bajo de los tres, a propósito.** Es el ÚNICO que se repite: al
 *    volumen del de clientes, a la tercera vuelta habría que silenciarlo.
 */
export const TONO_DE_LA_PUERTA = {
    /** De dónde a dónde. BAJA: los otros dos suben. */
    desde: 660,
    hasta: 495,
    /** Lo que dura cada golpe, en segundos. */
    duracion: 0.12,
    /** A qué volumen. Por debajo de los otros dos, que no se repiten. */
    volumen: 0.1,
    /** Cuántos golpes, como se llama a una puerta. */
    golpes: 2,
    /** Del principio de un golpe al siguiente, en segundos. */
    entreGolpes: 0.18,
} as const;

/**
 * Cada cuánto se repite mientras siga habiendo alguien.
 *
 * Seis segundos es el equilibrio que se buscó: lo bastante seguido como para
 * que no se pierda entre dos frases, y lo bastante espaciado como para que la
 * reunión no se convierta en una alarma. Con dos golpes de 120 ms, eso es un
 * 4 % del tiempo sonando.
 *
 * **No hay tope de repeticiones**, y es deliberado: pararlo solo sería volver
 * al fallo original —alguien esperando y nadie enterándose—. Lo que hay en su
 * lugar es el botón de callarlo, que es una decisión de quien modera y no un
 * plazo que se cumple sin que nadie lo vea.
 */
export const CADA_CUANTO_SUENA_LA_PUERTA_MS = 6_000;

/**
 * Quiénes esperan de verdad, descontando a los que ya se atendieron.
 *
 * Esto es lo que hace que **el sonido pare al instante** al pulsar «Dejar
 * entrar» o el rechazo, sin esperar a la vuelta del reloj. Es la misma regla
 * con la que se quita la fila de un chat al eliminarlo: se pinta la decisión
 * al momento y, si el servidor dice que no, se devuelve tal cual estaba — aquí
 * eso significa que ese id vuelve a contar y el aviso vuelve a sonar, que es lo
 * correcto: esa persona SIGUE esperando.
 *
 * Sin esto, entre pulsar y que el reloj traiga la lista sin esa persona pasan
 * un par de segundos, y en ese rato el aviso vuelve a sonar. Desde fuera eso no
 * se lee como un retardo: se lee como que el botón no hizo nada.
 */
export function losQueEsperanSinAtender(input: {
    esperando: ReadonlyArray<{ id: string }>;
    /** Sobre quiénes ya se decidió en esta pestaña y no ha llegado la vuelta. */
    yaDecididos: ReadonlyArray<string> | ReadonlySet<string>;
}): string[] {
    const decididos =
        input.yaDecididos instanceof Set ? input.yaDecididos : new Set(input.yaDecididos);
    return input.esperando.map((q) => q.id).filter((id) => !decididos.has(id));
}

/**
 * Si toca sonar ahora mismo.
 *
 * Cuatro condiciones, y cada una está por algo distinto:
 *
 * 1. **Hay alguien esperando sin atender.** Es de lo que va el aviso.
 * 2. **Y yo puedo abrirle.** A quien no puede dejar entrar a nadie, esto le
 *    sonaría por algo que no puede atender, que es ruido puro. Sale además
 *    gratis: el servidor ya manda la lista vacía a quien no abre la puerta.
 * 3. **No está silenciado.** La decisión de quien modera manda sobre el reloj.
 * 4. **Ha pasado el intervalo.** Es lo que convierte «hay alguien» en un aviso
 *    y no en un zumbido continuo.
 *
 * `ultimoSonido` en `null` es «todavía no ha sonado para esta tanda», y entonces
 * suena **ya**: quien llama a la puerta lleva esperando desde antes de que su
 * fila llegara aquí, así que hacerle esperar el primer intervalo entero es
 * empezar tarde.
 */
export function tocaSonarEnLaPuerta(input: {
    /** Cuántos esperan sin atender. Sale de `losQueEsperanSinAtender`. */
    cuantosEsperan: number;
    /** Si puedo dejar entrar a alguien. */
    abroLaPuerta: boolean;
    /** Si quien modera calló el aviso de esta reunión. */
    silenciado: boolean;
    /** Cuándo sonó la última vez, o `null` si no ha sonado. */
    ultimoSonido: number | null;
    ahora?: number;
}): boolean {
    const ahora = input.ahora ?? Date.now();
    if (input.cuantosEsperan <= 0) return false;
    if (!input.abroLaPuerta) return false;
    if (input.silenciado) return false;
    if (input.ultimoSonido === null) return true;
    return ahora - input.ultimoSonido >= CADA_CUANTO_SUENA_LA_PUERTA_MS;
}

/**
 * Lo que se le dice a quien modera, en una línea.
 *
 * Aquí y no en la pantalla porque el singular y el plural son **lo mismo** en
 * los dos sitios que lo pintan —la franja de la reunión y su pastilla plegada—
 * y escrito dos veces uno de los dos se queda con el plural mal el día que
 * cambie.
 */
export function elAvisoDeLaPuerta(cuantos: number): string {
    if (cuantos <= 0) return "";
    return cuantos === 1
        ? "Alguien está esperando para entrar"
        : `${cuantos} personas esperan para entrar`;
}
