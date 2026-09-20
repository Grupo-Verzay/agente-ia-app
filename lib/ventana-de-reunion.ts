/**
 * Los tres tamaños de la ventana de una reunión.
 *
 * Puro a propósito, como el resto de lo que decide sobre esta ventana
 * (`lib/ventana-flotante.ts`): de aquí tiran el panel que la sostiene, la sala
 * que pinta los botones y el banco.
 *
 * | | qué ocupa | se arrastra |
 * | --- | --- | --- |
 * | `pastilla` | una barra con el rato, el nombre y colgar | sí |
 * | `maximizada` | **desde el borde de arriba de la ventana**, tapando la barra superior y las migas; a la vista queda solo la barra de iconos de la izquierda | no |
 * | `completa` | la pantalla del equipo entera, esa barra incluida | no |
 *
 * # Por qué se fue el panel mediano flotante
 *
 * Eran cuatro y el de en medio —una ventana flotando encima del trabajo— no
 * servía para lo que prometía: durante una reunión o se mira la reunión o se
 * mira otra cosa, y para lo segundo ya está la pastilla, que ocupa una barra en
 * vez de media pantalla. Lo que hacía de verdad era **meter un escalón entre
 * «ampliar» y estar grande**, así que la primera pulsación se quedaba a medias
 * y parecía que el botón no llegaba más lejos.
 *
 * Con tres, cada pulsación cambia algo que se nota: pastilla → grande →
 * pantalla completa.
 *
 * # Nada se recuerda entre reuniones, y es a propósito
 *
 * Había un `localStorage` con el último tamaño. Con el panel fuera quedaban
 * tres, y de los tres **solo uno se puede restaurar**: `completa` la niega el
 * navegador sin un gesto de la persona, y abrir en `pastilla` es abrir una
 * reunión que no se ve empezar —quien acaba de pulsar «Entrar» espera verla—.
 * O sea que el recuerdo solo podía devolver `maximizada`, que es justo el valor
 * por defecto: una preferencia que no puede decir nada distinto de la constante
 * de al lado no es una preferencia, es una escritura por gesto para nada.
 *
 * # Y `completa` no la manda esta constante: la manda el navegador
 *
 * A pantalla completa se entra **pidiéndoselo al navegador**, y se sale de ella
 * por sitios que este código no controla: la tecla Escape, F11, cambiar de
 * pestaña en algunos sistemas. Por eso existe `alSalirDePantallaCompleta`:
 * salirse con Escape tiene que dejar la reunión **grande**, no plegarla — quien
 * pulsó Escape quería salir del modo pantalla completa, no encoger la reunión.
 */

export const ESTADOS_DE_LA_VENTANA = ["pastilla", "maximizada", "completa"] as const;

export type EstadoDeLaVentana = (typeof ESTADOS_DE_LA_VENTANA)[number];

/**
 * Con el que se abre una reunión, siempre.
 *
 * `maximizada` y no `pastilla`: quien pulsa «Entrar» espera ver la reunión. Y
 * no `completa`, que el navegador niega si no se le pide dentro de un gesto
 * —abrir una reunión no lo es— y dejaría la ventana pintada como completa
 * dentro de una página que no lo está.
 */
export const VENTANA_POR_DEFECTO: EstadoDeLaVentana = "maximizada";

export function esEstadoDeVentana(v: unknown): v is EstadoDeLaVentana {
    return typeof v === "string" && (ESTADOS_DE_LA_VENTANA as readonly string[]).includes(v);
}

/**
 * Dónde se cae al salir de pantalla completa sin pulsar nuestro botón.
 *
 * Escape y F11 sacan del modo sin avisarle a nadie. Quien lo pulsó quería
 * **salir de pantalla completa**, no encoger la reunión a una pastilla: cae en
 * `maximizada`, que es el escalón de al lado.
 */
export function alSalirDePantallaCompleta(): EstadoDeLaVentana {
    return "maximizada";
}

/**
 * Si en ese estado la ventana se puede mover con el ratón.
 *
 * Solo la pastilla. Las otras dos ocupan un hueco fijo, así que arrastrarlas no
 * tendría a dónde llevarlas — y el asa seguiría capturando el puntero, que es
 * peor que no tenerla: un trozo de la cabecera dejaría de poder pulsarse sin
 * que se viera por qué.
 */
export function sePuedeArrastrar(estado: EstadoDeLaVentana): boolean {
    return estado === "pastilla";
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
 * Una escala y no tres botones: la cabecera de una reunión ya tiene el nombre,
 * el contador, copiar el enlace y colgar, y tres mandos de tamaño más la llenan
 * entera justo en el ancho que escasea. Con dos flechas se llega a los tres y
 * **siempre se sabe cuál es el siguiente**.
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
