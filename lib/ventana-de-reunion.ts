/**
 * Los cuatro tamaños de la ventana de una reunión, y cuál se recuerda.
 *
 * Puro a propósito, como el resto de lo que decide sobre esta ventana
 * (`lib/ventana-flotante.ts`): de aquí tiran el panel que la sostiene, la sala
 * que pinta los botones y el banco.
 *
 * # Por qué cuatro y no dos
 *
 * Antes eran dos —plegada y panel— y eso deja fuera el caso de todos los días:
 * una reunión de media hora en la que hay que **mirar algo en la plataforma**
 * mientras se habla. Con el panel flotante encima, ese algo queda debajo; con
 * la pastilla, la reunión desaparece. Los cuatro cubren la escala entera:
 *
 * | | qué se ve | se arrastra |
 * | --- | --- | --- |
 * | `pastilla` | el rato, el nombre y colgar | sí |
 * | `panel` | la reunión, flotando encima del trabajo | sí |
 * | `maximizada` | la reunión llenando el hueco de contenido, **con el menú lateral y la barra de arriba a la vista** | no |
 * | `completa` | la pantalla entera, sin navegador alrededor | no |
 *
 * **`maximizada` no es `completa`.** Es la diferencia que se pidió y la que
 * más se usa: llena el sitio donde va el contenido y deja fuera el menú y la
 * barra, así que se puede cambiar de pantalla —o mirar la campanita— sin salir
 * de la reunión ni encogerla. `completa` es la del navegador, para cuando
 * alguien comparte pantalla y lo que importa es el píxel.
 *
 * # Y `completa` no la manda esta constante: la manda el navegador
 *
 * A pantalla completa se entra **pidiéndoselo al navegador**, y se sale de ella
 * por sitios que este código no controla: la tecla Escape, F11, cambiar de
 * pestaña en algunos sistemas. Por eso el estado guardado y el del navegador
 * se sincronizan en los dos sentidos, y por eso existe
 * `alSalirDePantallaCompleta`: salirse con Escape tiene que dejar la reunión
 * **grande**, no devolverla al panelito — quien pulsó Escape quería salir del
 * modo pantalla completa, no encoger la reunión.
 */

export const ESTADOS_DE_LA_VENTANA = ["pastilla", "panel", "maximizada", "completa"] as const;

export type EstadoDeLaVentana = (typeof ESTADOS_DE_LA_VENTANA)[number];

/**
 * El que se usa cuando no hay nada recordado.
 *
 * `panel` y no `maximizada`: la primera vez, una reunión que llena la pantalla
 * de golpe tapa lo que la persona estaba haciendo sin haberlo pedido. Flotando
 * se ve que hay algo detrás, que es la mitad de para lo que sirve este panel.
 */
export const VENTANA_POR_DEFECTO: EstadoDeLaVentana = "panel";

/**
 * Dónde se recuerda el último tamaño.
 *
 * En `localStorage` y no en la base: es una preferencia **de este navegador**,
 * y guardarla en el servidor sería una escritura por cada vez que alguien
 * pliega o amplía —que es lo más frecuente que se hace aquí— para devolver algo
 * que no importa si se pierde. Es el mismo reparto que el último canal abierto
 * del chat de equipo.
 *
 * **Sin cuenta ni persona en la llave, a propósito**: esto no depende de quién
 * mira ni de en qué cuenta está —una reunión se ve igual de grande sea de quien
 * sea—, así que una llave por persona solo conseguiría que el tamaño se
 * olvidara al cambiar de cuenta.
 */
export const LLAVE_DE_LA_VENTANA = "reunion:ventana";

export function esEstadoDeVentana(v: unknown): v is EstadoDeLaVentana {
    return typeof v === "string" && (ESTADOS_DE_LA_VENTANA as readonly string[]).includes(v);
}

/**
 * El estado con el que se abre una reunión, a partir de lo recordado.
 *
 * Lo que no se reconozca cae en el de por defecto — un `localStorage` viejo, de
 * otra versión o tocado a mano, no puede dejar la ventana en un estado que no
 * existe y por tanto sin pintar nada.
 *
 * Y **`completa` NO se recuerda**: es la única que necesita un gesto del
 * navegador para existir. Restaurarla al abrir significaría pedir pantalla
 * completa sin que nadie la haya pulsado, y los navegadores lo rechazan fuera
 * de un gesto de la persona — así que se restauraría un estado que el navegador
 * niega y la ventana saldría dibujada como completa dentro de una página que no
 * lo está. Se cae a `maximizada`, que es lo que se ve igual de grande.
 */
export function elEstadoDeEntrada(recordado: unknown): EstadoDeLaVentana {
    if (!esEstadoDeVentana(recordado)) return VENTANA_POR_DEFECTO;
    if (recordado === "completa") return "maximizada";
    return recordado;
}

/**
 * Qué se guarda de un estado.
 *
 * `completa` se guarda como `maximizada` por lo mismo que arriba: guardarla tal
 * cual dejaría el recuerdo apuntando a algo que la vuelta siguiente no va a
 * poder restaurar.
 */
export function loQueSeRecuerda(estado: EstadoDeLaVentana): EstadoDeLaVentana {
    return estado === "completa" ? "maximizada" : estado;
}

/**
 * Dónde se cae al salir de pantalla completa sin pulsar nuestro botón.
 *
 * Escape y F11 sacan del modo pantalla completa sin avisarle a nadie. Quien lo
 * pulsó quería **salir de pantalla completa**, no encoger la reunión al
 * panelito: cae en `maximizada`, que es el escalón de al lado.
 */
export function alSalirDePantallaCompleta(): EstadoDeLaVentana {
    return "maximizada";
}

/**
 * Si en ese estado la ventana se puede mover con el ratón.
 *
 * Solo las dos que flotan. `maximizada` y `completa` ocupan un hueco fijo, así
 * que arrastrarlas no tendría a dónde llevarlas — y el asa seguiría capturando
 * el puntero, que es peor que no tenerla: un trozo de la cabecera dejaría de
 * poder pulsarse sin que se viera por qué.
 */
export function sePuedeArrastrar(estado: EstadoDeLaVentana): boolean {
    return estado === "pastilla" || estado === "panel";
}

/**
 * Si en ese estado hace falta pedirle pantalla completa al navegador.
 *
 * Se pregunta en los dos sentidos —entrar y salir— desde un solo sitio, porque
 * el fallo aquí es asimétrico y mudo: pedirla dos veces no hace nada, pero
 * **olvidarse de salir** deja el navegador en pantalla completa con la reunión
 * ya plegada, o sea una pastilla flotando sobre una página negra.
 */
export function quiereLaPantallaCompleta(estado: EstadoDeLaVentana): boolean {
    return estado === "completa";
}

/**
 * El siguiente al pulsar «ampliar», y el anterior al pulsar «reducir».
 *
 * Una escala y no cuatro botones: la cabecera de una reunión ya tiene el
 * nombre, el contador, copiar el enlace y colgar, y cuatro mandos de tamaño más
 * la llenan entera justo en el ancho que escasea. Con dos flechas se llega a
 * los cuatro estados y **siempre se sabe cuál es el siguiente**.
 *
 * Los extremos se quedan quietos en vez de dar la vuelta: una escala que salta
 * de `completa` a `pastilla` al pulsar otra vez «ampliar» hace desaparecer la
 * reunión justo cuando se está intentando verla mejor.
 */
export function alAmpliar(estado: EstadoDeLaVentana): EstadoDeLaVentana {
    const i = ESTADOS_DE_LA_VENTANA.indexOf(estado);
    return ESTADOS_DE_LA_VENTANA[Math.min(i + 1, ESTADOS_DE_LA_VENTANA.length - 1)];
}

export function alReducir(estado: EstadoDeLaVentana): EstadoDeLaVentana {
    const i = ESTADOS_DE_LA_VENTANA.indexOf(estado);
    return ESTADOS_DE_LA_VENTANA[Math.max(i - 1, 0)];
}
