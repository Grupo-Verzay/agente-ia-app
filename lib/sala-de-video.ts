/**
 * Las salas de video: hasta cuatro personas, navegador contra navegador.
 *
 * Puro a propósito, como `lib/llamada-de-voz.ts` y por el mismo motivo: de aquí
 * tiran la pantalla —que es cliente—, las acciones —que son servidor— y el
 * banco. Lo que toca la base vive en `lib/salas-de-video-db.ts`.
 *
 * # Esto es una MALLA, no una llamada de dos con gente dentro
 *
 * Sin servidor de video, cada persona habla **directamente con cada una de las
 * demás**: con cuatro son seis conexiones, y cada una manda y recibe su propio
 * audio y su propio video. De ahí sale el tope, que no es un número redondo
 * elegido a ojo:
 *
 * | personas | conexiones | lo que SUBE cada una |
 * | --- | --- | --- |
 * | 2 | 1 | 1 copia |
 * | 3 | 3 | 2 copias |
 * | 4 | **6** | **3 copias** |
 * | 5 | 10 | 4 copias |
 *
 * Subir es lo que se rompe primero: una conexión doméstica típica tiene mucha
 * menos subida que bajada, y a la cuarta copia ya se está pidiendo del orden de
 * 2 Mbps **de subida** a cada participante. Con cinco son cuatro copias y
 * empieza a cortarse para todos a la vez, no solo para quien va justo. Pasar de
 * ahí no es subir una constante: es poner un servidor de video (una SFU), que
 * es justamente lo que esto no tiene.
 *
 * # Y por eso NO se renegocia nunca
 *
 * La señalización va por la base con un reloj —igual que la llamada de voz, y
 * por la misma razón: el socket de tiempo real es del backend y desde la App
 * solo se escucha—. Eso obliga a que cada conexión se negocie **una sola vez**:
 * una oferta, una respuesta, y ya.
 *
 * Lo que lo hace posible es que las dos pistas se negocian **siempre**, aunque
 * no haya ni cámara ni micro que poner encima: se abre un transceptor de audio
 * y uno de video en `sendrecv` desde el principio, y encender la cámara,
 * callarse o compartir la pantalla son `replaceTrack` y `enabled` — cosas que
 * pasan **dentro** de una conexión ya negociada y no necesitan decirle nada a
 * nadie.
 *
 * Si en vez de eso se añadiera una pista al compartir pantalla, habría que
 * renegociar **las seis conexiones** contra un reloj de segundos: varios
 * segundos de corte cada vez que alguien pulsa «compartir», y seis sitios
 * donde puede fallar. Con `replaceTrack` es instantáneo y no viaja nada.
 *
 * El precio, que se dice porque se nota: **mientras se comparte pantalla no se
 * manda la cámara**. Es la misma pista de video ocupada por otra cosa. Al dejar
 * de compartir vuelve la cámara sola.
 */

/**
 * Cuántas personas caben a la vez. Ver la tabla de arriba: **no es un número
 * que se pueda subir**, es donde la subida de una conexión normal se acaba.
 */
export const TOPE_DE_LA_SALA = 4;

/**
 * Cuántos pueden estar esperando a la vez en la puerta.
 *
 * No es una regla de producto: el enlace es público, así que sin tope
 * cualquiera que lo tuviera podría llenar la tabla llamando a la puerta en
 * bucle. Veinte es más de lo que ninguna reunión de cuatro va a tener en la
 * sala de espera, y sigue cabiendo en una lista que se lee de un vistazo.
 */
export const TOPE_EN_LA_PUERTA = 20;

/**
 * Cada cuánto pregunta quien está dentro de una sala.
 *
 * Más corto que el reloj de las llamadas (3 s) porque aquí lo que espera es
 * **entrar**: una oferta que tarda dos vueltas en cruzar son seis segundos
 * mirando un recuadro negro. Y se paga solo mientras hay una reunión abierta —
 * este reloj **no** cuelga del layout, a diferencia del oyente de llamadas.
 */
export const CADA_CUANTO_EN_LA_SALA_MS = 2_000;

/**
 * Cada cuánto pregunta quien está esperando en la puerta.
 *
 * Más lento a propósito: lo único que espera es que alguien le deje pasar, y
 * quien espera puede no entrar nunca. Con el mismo ritmo que dentro, una
 * pestaña olvidada en la sala de espera costaría lo mismo que una reunión.
 */
export const CADA_CUANTO_EN_LA_PUERTA_MS = 4_000;

/**
 * Cuánto se da por presente a alguien de la sala desde su último latido.
 *
 * Tres vueltas más un margen, como la presencia de las llamadas: con una sola
 * vuelta, un navegador que tarde en contestar sacaría de la reunión a alguien
 * que está delante — y en una malla eso además **cierra sus conexiones** con
 * todos los demás, que es mucho más caro de deshacer que un punto gris.
 */
export const MARGEN_EN_LA_SALA_MS = 3 * CADA_CUANTO_EN_LA_SALA_MS + 15_000;

/** En qué punto está alguien respecto de una sala. */
export const ESTADOS_EN_LA_SALA = ["esperando", "dentro", "fuera", "rechazado"] as const;
export type EstadoEnLaSala = (typeof ESTADOS_EN_LA_SALA)[number];

/** Qué clase de mensaje de señalización es. Dos, porque no hay goteo. */
export const TIPOS_DE_SENAL = ["oferta", "respuesta"] as const;
export type TipoDeSenal = (typeof TIPOS_DE_SENAL)[number];

export function esTipoDeSenal(v: unknown): v is TipoDeSenal {
    return typeof v === "string" && (TIPOS_DE_SENAL as readonly string[]).includes(v);
}

/**
 * Cuánto vale un enlace de reunión.
 *
 * Lista cerrada y no un número que llegue del navegador: es lo que decide
 * cuánto tiempo puede entrar alguien de fuera, así que un valor inventado desde
 * la pantalla sería un enlace que no caduca nunca sin que nadie lo decidiera.
 *
 * Las cinco primeras cubren lo que pasa de verdad —una reunión ahora, una hoy,
 * una mañana, una recurrente de la semana, una del mes—. La sexta es distinta y
 * por eso lleva su propia marca:
 *
 * > **«No caduca» existe, y solo la elige quien ADMINISTRA la cuenta**
 * > (`soloQuienManda`). Es para lo que se pidió: **un enlace fijo de atención**,
 * > siempre el mismo, que se pega en una firma o en un mensaje automático y no
 * > hay que renovar cada semana.
 *
 * Lo que la hace aceptable —y esto es lo que no se puede aflojar— es que **se
 * ve y se puede cerrar**: sale en la lista de Reuniones de su cuenta, con su
 * botón de revocar y el de regenerar al lado. Un enlace permanente que no
 * apareciera en ninguna pantalla sería justo lo que la regla anterior evitaba:
 * *un enlace que nadie sabe que sigue abierto*.
 *
 * Por eso **quien no administra la cuenta no la ve siquiera**
 * (`duracionesQuePuedeElegir`), y por eso el servidor lo vuelve a comprobar
 * (`laDuracionQueSePuede`): esconder la opción no cierra la petición directa.
 */
export const DURACIONES = [
    { valor: "1h", rotulo: "1 hora", horas: 1, soloQuienManda: false },
    { valor: "8h", rotulo: "8 horas", horas: 8, soloQuienManda: false },
    { valor: "24h", rotulo: "1 día", horas: 24, soloQuienManda: false },
    { valor: "7d", rotulo: "7 días", horas: 24 * 7, soloQuienManda: false },
    { valor: "30d", rotulo: "30 días", horas: 24 * 30, soloQuienManda: false },
    { valor: "nunca", rotulo: "No caduca", horas: null, soloQuienManda: true },
] as const;

export type Duracion = (typeof DURACIONES)[number]["valor"];

/** La única que no pone fecha. Se nombra para no escribir `"nunca"` suelto. */
export const SIN_CADUCIDAD: Duracion = "nunca";

/**
 * La de por defecto: **una semana**, y antes era un día.
 *
 * Un día parecía lo prudente y en la práctica es la trampa: la reunión que se
 * agenda se agenda **para mañana**, así que un enlace creado esta mañana con 24
 * horas llega caducado a la reunión de mañana por la tarde. Desde fuera eso no
 * se lee como «elegí mal la duración»: se lee como que los enlaces de reuniones
 * no funcionan, y quien lo sufre es el invitado de fuera, que no tiene forma de
 * arreglarlo.
 *
 * Una semana cubre agendar con antelación normal y sigue caducando. Y ahora
 * además **se puede mover después** (`cuandoCaducaAlCambiar`), así que
 * equivocarse por abajo ya no obliga a crear otra sala y repartir otro enlace.
 *
 * **La de por defecto nunca es «No caduca»**, aunque exista: lo que no encaje
 * cae aquí, y caer en un enlace permanente por no reconocer un valor es
 * exactamente el enlace que nadie sabe que sigue abierto. Sin caducidad se sale
 * solo eligiéndolo a mano, y solo quien administra la cuenta.
 */
export const DURACION_POR_DEFECTO: Duracion = "7d";

/**
 * Qué duraciones se le pueden OFRECER a alguien.
 *
 * Una sola función para la pantalla de Reuniones y para el diálogo de un canal,
 * y por eso recibe el `manda` en vez de leerlo: el diálogo del canal corre en el
 * navegador y no tiene forma de resolverlo.
 *
 * **El diálogo de un canal pasa `false` a propósito**, aunque quien lo abra
 * administre la cuenta: el enlace de una sala de canal vive en el hilo del
 * canal y **no sale en ninguna lista** desde la que revocarlo de un vistazo.
 * Lo que hace aceptable un enlace permanente es poder verlo y cerrarlo, y eso
 * solo lo da la pantalla de Reuniones.
 */
export function duracionesQuePuedeElegir(
    mandaEnLaCuenta: boolean,
): ReadonlyArray<(typeof DURACIONES)[number]> {
    return DURACIONES.filter((d) => !d.soloQuienManda || mandaEnLaCuenta);
}

/**
 * La duración que de verdad se puede guardar, decidida en el SERVIDOR.
 *
 * Devuelve el motivo y no un booleano porque los dos «no» se arreglan de forma
 * distinta y quien los recibe tiene que poder decirlo: una duración que no
 * existe es una pantalla vieja o una petición a mano; «No caduca» sin mandar en
 * la cuenta es un permiso, y esa persona tiene que saber que la opción existe y
 * no es suya.
 *
 * La comprueban **los tres** caminos que reciben una duración —abrir una
 * reunión de la cuenta, abrir una en un canal y mover la caducidad de una que
 * ya existe—. Con la condición escrita en uno solo, el cuarto la olvida y
 * entonces «solo quien administra» deja de ser cierto por esa puerta.
 */
export function laDuracionQueSePuede(
    duracion: unknown,
    mandaEnLaCuenta: boolean,
): { ok: true; valor: Duracion } | { ok: false; motivo: "desconocida" | "no_puede" } {
    const elegida = DURACIONES.find((d) => d.valor === duracion);
    if (!elegida) return { ok: false, motivo: "desconocida" };
    if (elegida.soloQuienManda && !mandaEnLaCuenta) return { ok: false, motivo: "no_puede" };
    return { ok: true, valor: elegida.valor };
}

/**
 * Cuándo caduca un enlace que se crea ahora, o `null` si no caduca.
 *
 * `null` **no es «no se sabe»**: es «no caduca», y por eso el tipo lo dice en
 * vez de devolver una fecha absurdamente lejana. Una fecha inventada a cien
 * años es un centinela, y un centinela acaba impreso — la regla de los
 * «999999999 de -1 créditos», aplicada a una caducidad.
 *
 * Lo que no encaje en la lista cae en la de por defecto, **nunca en “no
 * caduca”**: equivocarse hacia un día de más es un enlace que hay que revocar a
 * mano; equivocarse hacia el infinito es un enlace que nadie sabe que sigue
 * abierto. Quién puede elegir la que no caduca lo decide `laDuracionQueSePuede`,
 * antes de llegar aquí.
 */
export function cuandoCaduca(duracion: unknown, desde: number = Date.now()): Date | null {
    const elegida =
        DURACIONES.find((d) => d.valor === duracion) ??
        DURACIONES.find((d) => d.valor === DURACION_POR_DEFECTO)!;
    if (elegida.horas === null) return null;
    return new Date(desde + elegida.horas * 60 * 60 * 1000);
}

/**
 * Cuándo caduca un enlace al que se le CAMBIA la duración.
 *
 * Se mide **desde ahora**, no desde que se creó la sala, y es lo único que
 * tiene enjundia aquí. Medido desde la creación, alargar a «7 días» una sala
 * abierta hace seis no daría casi nada: quien lo pulsa vería el enlace caducar
 * al día siguiente sin entender por qué, y volvería a crear otra sala — que es
 * justo lo que poder moverla viene a evitar. Quien mueve la caducidad está
 * diciendo «que valga N **a partir de ahora**», como cualquier calendario.
 *
 * Lo que no encaje en la lista cae en la de por defecto, **nunca en “no
 * caduca”**: la misma regla que al crearla.
 */
export function cuandoCaducaAlCambiar(
    duracion: unknown,
    ahora: number = Date.now(),
): Date | null {
    return cuandoCaduca(duracion, ahora);
}

/**
 * Si lo que llega del navegador es una duración de la lista.
 *
 * `cuandoCaduca` ya cae en la de por defecto ante cualquier cosa, así que esto
 * no protege la fecha: protege el **aviso**. Sin él, teclear una duración que
 * no existe guardaría siete días en silencio y quien lo hizo creería haber
 * puesto otra cosa.
 *
 * **No basta por sí solo**: dice que el valor existe, no que quien lo manda
 * pueda elegirlo. Eso lo contesta `laDuracionQueSePuede`, que es la que usan
 * las acciones.
 */
export function esUnaDuracion(v: unknown): v is Duracion {
    return DURACIONES.some((d) => d.valor === v);
}

/**
 * Lo que se lee debajo del nombre de una sala viva.
 *
 * Una sola función para las dos pantallas que lo enseñan —Reuniones y el
 * diálogo de un canal—, y devuelve **la frase entera** y no el rato: con un
 * «Caduca » escrito delante en cada sitio, un enlace sin caducidad saldría como
 * «Caduca No caduca». Eso es lo que pasa cuando el prefijo vive en la pantalla
 * y el caso nuevo llega después.
 */
export function comoSeLeeLaCaducidad(
    expiraEn: string | Date | null | undefined,
    ahora: number = Date.now(),
): string {
    const marca = aMarca(expiraEn ?? null);
    if (marca === null) return "No caduca";
    const falta = marca - ahora;
    if (falta <= 0) return "Caduca ya";
    const horas = Math.round(falta / (60 * 60 * 1000));
    if (horas < 1) return "Caduca en menos de 1 h";
    if (horas < 24) return `Caduca en ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? "Caduca mañana" : `Caduca en ${dias} días`;
}

/**
 * Si una sala sigue admitiendo gente.
 *
 * **Las dos puertas, y en este orden**: revocada manda sobre caducada, porque
 * revocar es una decisión que alguien tomó y tiene que poder decirse con esas
 * palabras. Un enlace revocado que dijera «caducado» mandaría a pedir otro
 * cuando lo que hubo fue una retirada.
 */
export function comoEstaLaSala(
    sala: { expiraEn: Date | string | null; revocadaEn: Date | string | null },
    ahora: number = Date.now(),
): "abierta" | "revocada" | "caducada" {
    if (sala.revocadaEn) return "revocada";
    const expira = aMarca(sala.expiraEn);
    if (expira !== null && ahora > expira) return "caducada";
    return "abierta";
}

/** Lo que se le dice a quien llega con un enlace que ya no vale. */
export function loQueSeLeDiceAlQueLlegaTarde(estado: "revocada" | "caducada"): string {
    return estado === "revocada"
        ? "Este enlace de reunión ya no está activo. Pídele uno nuevo a quien te lo pasó."
        : "Este enlace de reunión ha caducado. Pídele uno nuevo a quien te lo pasó.";
}

function aMarca(v: Date | string | null | undefined): number | null {
    if (!v) return null;
    const m = v instanceof Date ? v.getTime() : Date.parse(String(v));
    return Number.isFinite(m) ? m : null;
}

/**
 * Si a alguien de la sala se le sigue viendo.
 *
 * Mismo criterio que la presencia de las llamadas: sin latido reciente, fuera.
 * Es lo que cierra la sala sola cuando alguien cierra la pestaña sin despedirse
 * —que es lo normal— en vez de dejar un recuadro negro para siempre.
 */
export function sigueDentro(
    vistoEn: Date | string | null | undefined,
    ahora: number = Date.now(),
): boolean {
    const marca = aMarca(vistoEn);
    if (marca === null) return false;
    return ahora - marca <= MARGEN_EN_LA_SALA_MS;
}

/**
 * Quién de los dos hace la oferta.
 *
 * **La pregunta entera de una malla**, y la respuesta tiene que ser la misma en
 * las dos puntas sin que se pongan de acuerdo: si los dos ofrecen a la vez, las
 * dos ofertas chocan (*glare*) y la conexión no se establece; si no ofrece
 * ninguno, tampoco.
 *
 * Se decide comparando los ids: **ofrece el menor**. Es una regla pura, sin
 * reloj y sin orden de llegada, así que las dos puntas llegan a la misma
 * conclusión aunque se vean por primera vez en vueltas distintas del reloj —
 * que es justo lo que pasa cuando alguien entra y los demás lo descubren cada
 * uno en su vuelta.
 *
 * Con la hora de llegada sería frágil: dos personas que entran en el mismo
 * segundo podrían verse en orden distinto, y ahí vuelve el choque.
 */
export function debeOfrecer(yo: string, elOtro: string): boolean {
    if (!yo || !elOtro || yo === elOtro) return false;
    return yo < elOtro;
}

/**
 * Con quién hay que tener conexión, y con quién sobra.
 *
 * Devuelve las dos listas de una vez porque las dos salen del mismo dato y
 * quien llama necesita las dos en la misma vuelta: abrir las que faltan y
 * **cerrar las que sobran**. Sin la segunda, quien se va deja su conexión
 * abierta y su recuadro negro en la pantalla de los demás para siempre.
 */
export function comoQuedaLaMalla(input: {
    yo: string;
    /** Los que están dentro ahora mismo, incluido uno mismo. */
    dentro: string[];
    /** Con los que ya hay conexión montada. */
    montadas: string[];
}): { abrir: string[]; cerrar: string[] } {
    const otros = Array.from(new Set(input.dentro.filter((p) => p && p !== input.yo)));
    const montadas = Array.from(new Set(input.montadas));
    return {
        abrir: otros.filter((p) => !montadas.includes(p)),
        cerrar: montadas.filter((p) => !otros.includes(p)),
    };
}

/**
 * El nombre con el que entra alguien de fuera.
 *
 * Llega del navegador de alguien **sin cuenta**, así que es el único dato que
 * esa persona aporta y lo van a ver todos los de dentro. Tres cosas:
 *
 * 1. **Sin saltos de línea ni espacios de sobra.** Un nombre con `\n` dentro
 *    rompe la fila de la lista de espera, que es donde se decide si se le deja
 *    pasar.
 * 2. **Corto.** Cuarenta caracteres es un nombre largo; doscientos es alguien
 *    escribiendo un mensaje en el sitio del nombre.
 * 3. **Nunca vacío**: sin nombre, la sala de espera enseñaría una fila en
 *    blanco y el anfitrión estaría decidiendo a ciegas. Se pide en la pantalla
 *    y se vuelve a exigir aquí.
 */
export function comoSeGuardaElNombre(nombre: unknown): string | null {
    if (typeof nombre !== "string") return null;
    const limpio = nombre.replace(/\s+/g, " ").trim();
    if (!limpio) return null;
    return limpio.slice(0, 40);
}

/**
 * Si eso que llega es una descripción de sesión con la forma que mandamos.
 *
 * No valida el SDP —eso lo hace el navegador al aplicarlo— sino que **sea el
 * objeto que se espera y no un texto cualquiera**: sin esto, la tabla de
 * señales es un sitio donde alguien con acceso a una sala puede dejarle a otro
 * el texto que quiera, y ese texto se le entrega al navegador de la otra punta.
 *
 * El tope de tamaño es por lo mismo: un SDP de una llamada de dos pistas son
 * unos pocos kilobytes; cien kilobytes es otra cosa.
 */
export const TOPE_DEL_SDP = 64 * 1024;

export function comoSeGuardaElSdp(crudo: unknown, tipo: TipoDeSenal): string | null {
    if (typeof crudo !== "string") return null;
    const texto = crudo.trim();
    if (!texto || texto.length > TOPE_DEL_SDP) return null;
    let leido: unknown;
    try {
        leido = JSON.parse(texto);
    } catch {
        return null;
    }
    if (!leido || typeof leido !== "object") return null;
    const d = leido as { type?: unknown; sdp?: unknown };
    const esperado = tipo === "oferta" ? "offer" : "answer";
    if (d.type !== esperado) return null;
    if (typeof d.sdp !== "string" || !d.sdp.trim()) return null;
    return texto;
}

/**
 * Cómo se reparte la rejilla, según cuánta gente haya.
 *
 * Devuelve **columnas Y FILAS**, y lo segundo es lo que costó una medida.
 *
 * La primera versión solo daba columnas y dejaba cada recuadro en
 * `aspect-video`, o sea con la altura atada al ancho. Medido en Chromium: con
 * cuatro personas a 1440×900, cada recuadro salía de 704×396 y **dos filas son
 * 792 px** — más de lo que queda entre la cabecera y los mandos. Los dos de
 * abajo quedaban por debajo de la barra de botones y había que desplazarse
 * dentro de la rejilla para verlos, que en una videollamada es como no tenerlos.
 * Y no se ve mirando la pantalla con dos personas, que es como se prueba esto.
 *
 * Con las filas declaradas, la rejilla ocupa **el alto que hay** y cada
 * recuadro se reparte lo que le toca. Caben siempre los cuatro sin desplazar
 * nada.
 *
 * Con **dos** va a una columna en vertical y a dos en cuanto hay sitio: un
 * móvil en vertical con dos recuadros lado a lado deja dos sellos de correos.
 */
export function laRejilla(cuantos: number): string {
    if (cuantos <= 1) return "grid-cols-1 grid-rows-1";
    if (cuantos === 2) return "grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1";
    return "grid-cols-2 grid-rows-2";
}

/** Lo que se lee en el recuadro de alguien cuya cámara está apagada. */
export function lasIniciales(nombre: string): string {
    const trozos = (nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!trozos.length) return "?";
    const primera = trozos[0][0] ?? "";
    const segunda = trozos.length > 1 ? trozos[trozos.length - 1][0] ?? "" : "";
    return (primera + segunda).toUpperCase();
}

/**
 * La dirección de una sala, para copiarla y pasarla.
 *
 * Una sola función para que la pantalla, el mensaje que se publica en el canal
 * y el botón de copiar digan **la misma dirección**. Escrita a mano en tres
 * sitios, el día que la ruta cambie una de las tres manda a una página que no
 * existe — y esa es la que alguien ya tiene pegada en un correo.
 */
export function laDireccionDeLaSala(codigo: string, base?: string | null): string {
    const raiz = (base || "").replace(/\/+$/, "");
    return `${raiz}/reunion/${codigo}`;
}

// ── Lo que se añadió al hacerla usable ──────────────────────────────────────

/**
 * Cómo se reparten los recuadros.
 *
 * Dos, y **`orador` es la de por defecto**: con cuatro personas en cuadrícula
 * todo el mundo sale del tamaño de un sello, y lo que se mira en una reunión es
 * a quien habla. La cuadrícula se queda para cuando lo que importa es ver a
 * todos a la vez —repasar caras, una reunión de dos— y se elige a mano.
 */
export const DISTRIBUCIONES = ["orador", "cuadricula"] as const;
export type Distribucion = (typeof DISTRIBUCIONES)[number];
export const DISTRIBUCION_POR_DEFECTO: Distribucion = "orador";

export function esUnaDistribucion(v: unknown): v is Distribucion {
    return typeof v === "string" && (DISTRIBUCIONES as readonly string[]).includes(v);
}

/** Dónde se recuerda, por el mismo motivo que el tamaño de la ventana. */
export const LLAVE_DE_LA_DISTRIBUCION = "reunion:distribucion";

/**
 * Con una sola persona, la cuadrícula y el orador son lo mismo.
 *
 * Y entonces manda la cuadrícula: la vista de orador con cero miniaturas
 * pintaría una tira vacía al lado del único recuadro, o sea un hueco gris
 * pidiendo explicación. No es una preferencia, es que ahí no hay nada que
 * repartir.
 */
export function laDistribucionQueSeVe(
    elegida: Distribucion,
    cuantos: number,
): Distribucion {
    return cuantos <= 1 ? "cuadricula" : elegida;
}

/**
 * Las dos pestañas del panel de al lado, y lo que se recuerda de él.
 *
 * Se guarda **lo que se está mirando**, o `plegado`. Tres valores y no un
 * booleano aparte: con «abierto» por un lado y «qué pestaña» por otro, el día
 * que uno de los dos no se escriba el panel vuelve abierto por la pestaña de
 * otra reunión, y eso se lee como que la App eligió sola.
 *
 * Y el valor por defecto —no haber guardado nada— es **plegado**: una reunión
 * se abre para ver a la gente, no para leer un chat que todavía está vacío.
 */
export const PESTANAS_DEL_PANEL = ["chat", "gente"] as const;
export type PestanaDelPanel = (typeof PESTANAS_DEL_PANEL)[number];
export type PanelGuardado = PestanaDelPanel | "plegado";

export const LLAVE_DEL_PANEL = "reunion:panel";

export function esPanelGuardado(v: unknown): v is PanelGuardado {
    return (
        v === "plegado" || (typeof v === "string" && (PESTANAS_DEL_PANEL as readonly string[]).includes(v))
    );
}

/** Cómo se guarda lo que hay ahora: `null` es plegado. */
export function comoSeGuardaElPanel(panel: PestanaDelPanel | null): PanelGuardado {
    return panel ?? "plegado";
}

/**
 * Con qué panel se abre una reunión, a partir de lo guardado.
 *
 * Lo que no se entienda —un valor de otra versión, algo a medio escribir— cae
 * en plegado. Se ve de menos, nunca de más: un panel que se abre solo tapa el
 * video de quien no pidió nada.
 */
export function elPanelDeEntrada(guardado: unknown): PestanaDelPanel | null {
    if (!esPanelGuardado(guardado) || guardado === "plegado") return null;
    return guardado;
}

/**
 * Si la tira de miniaturas de la vista de orador va plegada, y lo que se
 * recuerda de ella.
 *
 * Es la misma idea que el panel de al lado (#837): un booleano en
 * `localStorage`, escrito por un solo sitio. Pero el valor por defecto es el
 * **CONTRARIO** —abierta— y la diferencia no es un descuido: el panel se abre
 * plegado porque un chat vacío no tiene nada que enseñar, pero la tira son las
 * **caras de los demás**, y esconderlas por defecto sería empezar toda reunión
 * ocultando a la gente. Lo que no se entienda cae también en «abierta»: se ve
 * de más —todos—, nunca de menos.
 *
 * Plegarla es lo que hace que el orador crezca y ocupe el ancho de la tira: el
 * recuadro grande es `flex-1`, así que en cuanto la tira sale del reparto
 * (`display:none`, sin desmontar sus `<video>` — el audio no se corta) el
 * grande se lleva todo el sitio.
 */
export const LLAVE_DE_LA_TIRA = "reunion:tira";

/** Cómo se guarda lo que hay ahora. */
export function comoSeGuardaLaTira(plegada: boolean): "plegada" | "abierta" {
    return plegada ? "plegada" : "abierta";
}

/** Si al abrir la reunión la tira va plegada. Por defecto NO. */
export function laTiraDeEntrada(guardado: unknown): boolean {
    return guardado === "plegada";
}

/**
 * Si de un remoto está llegando video ahora mismo, para pintar su recuadro o
 * las iniciales.
 *
 * **La pista NO basta**, y es el fallo de privacidad que esto arregla: al
 * apagar la cámara se hace `replaceTrack(null)` en el emisor, y eso la otra
 * punta **no lo nota de forma fiable** —la pista receptora no siempre pasa a
 * `muted` ni a `ended`, así que se queda el ÚLTIMO fotograma congelado—. Desde
 * fuera parece que la persona sigue con la cámara puesta, cuando quien la apagó
 * cree que ya no se le ve.
 *
 * Por eso manda lo **señalizado** —lo que esa persona dice que está mandando,
 * que viaja en el latido igual que el estado del micro (`camaraEncendida`,
 * `compartiendo`)— y la pista solo **confirma** que de verdad ha llegado algo.
 * Las dos condiciones hacen falta:
 *
 * - Si dice que no manda cámara ni pantalla → iniciales, aunque la pista siga
 *   trayendo un fotograma viejo. Es la mitad que arregla el congelado.
 * - Si dice que sí pero la pista todavía no ha llegado (`pistaViva` falso) →
 *   iniciales también: está conectando, y pintar un recuadro negro sería peor.
 */
export function hayVideoDelRemoto(input: {
    camaraEncendida: boolean;
    compartiendo: boolean;
    /** Si hay una pista de video viva y sin `muted`. */
    pistaViva: boolean;
}): boolean {
    return (input.camaraEncendida || input.compartiendo) && input.pistaViva;
}

/**
 * Lo que se guarda de un mensaje del chat de la reunión.
 *
 * Tres cosas, y ninguna es cosmética:
 *
 * 1. **Nunca vacío.** Un mensaje en blanco es una burbuja sin nada dentro que
 *    nadie sabe explicar, y se manda solo con pulsar Enter sin querer.
 * 2. **Con un tope.** Esto viaja en CADA vuelta del reloj de la sala, o sea
 *    cada dos segundos y por persona: sin tope, alguien pegando un documento
 *    entero lo mete en el camino más caliente de esta pantalla para siempre.
 * 3. **Sin recortar los saltos de línea**, al revés que un nombre. Aquí sí se
 *    escribe en varias líneas —se pega un error, una dirección— y aplastarlos
 *    convertiría lo pegado en un churro. Lo que sí se quita es el exceso: más
 *    de dos saltos seguidos es alguien dejando hueco, no estructura.
 */
export const TOPE_DEL_MENSAJE = 2_000;

export function comoSeGuardaElMensaje(texto: unknown): string | null {
    if (typeof texto !== "string") return null;
    const limpio = texto.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!limpio) return null;
    return limpio.slice(0, TOPE_DEL_MENSAJE);
}

/**
 * Cuántos mensajes del chat viajan en una vuelta del reloj.
 *
 * El reloj trae **solo los que faltan** —los posteriores al último que ya se
 * tiene— así que en marcha normal esto es cero o uno. El tope es para el caso
 * de volver a la pestaña después de un rato: sin él, una conversación larga
 * llegaría entera de golpe en la misma respuesta que trae las ofertas de
 * WebRTC, que es lo que no puede engordar.
 */
export const TOPE_DE_MENSAJES_POR_VUELTA = 50;

/**
 * Quién puede silenciar y sacar a alguien de una reunión en marcha.
 *
 * **No se decide aquí**, y conviene que esté escrito porque es donde se iba a
 * escribir por segunda vez: la pregunta ya la contesta
 * `puedeAdministrarLaSala` (`lib/reuniones-de-la-cuenta.ts`) — el anfitrión, o
 * quien administra la cuenta dueña de la sala—, y es la misma que decide
 * revocar el enlace o moverle la caducidad. Una segunda formulación aquí sería
 * exactamente la trampa de siempre: el día que se afine una, la otra se queda
 * atrás, y aquí eso significa o un botón que da error, o un botón que no está
 * sobre una puerta que sí.
 *
 * Lo que SÍ es propio de la reunión en marcha, y por eso se dice aquí:
 *
 * > **Moderar no es abrir la puerta.** Abrir la puerta lo puede cualquiera del
 * > equipo que ya esté dentro (`puedeAbrirLaPuerta`), y tiene que ser así: si
 * > solo pudiera el anfitrión, sus invitados se quedarían en la sala de espera
 * > para siempre en cuanto él cerrara la pestaña. Silenciar y expulsar se le
 * > hace **a** alguien, no se le hace un favor, así que se queda en quien
 * > responde de la reunión.
 *
 * Y **un invitado no modera nunca**, aunque por algún camino se le calculara lo
 * demás: lo que le dejó entrar fue una decisión de alguien del equipo, y eso no
 * se hereda. Esa mitad la cierra la acción, que a un invitado ni le resuelve
 * una sesión con la que preguntar.
 */

/**
 * Cuánto dura la petición de silencio antes de darse por atendida.
 *
 * Silenciar a alguien **no le apaga el micro desde el servidor** —no se puede,
 * y menos mal: el servidor no tiene ninguna pista que tocar—. Lo que se hace es
 * dejar una marca que el navegador de esa persona lee en su siguiente vuelta y
 * **obedece apagando su propio micro**, que es como lo hacen todas.
 *
 * De ahí sale esta constante: la marca tiene que **caducar**. Si se quedara
 * puesta, esa persona no podría volver a encender el micro nunca — cada vuelta
 * del reloj le traería la orden otra vez y se volvería a callar sola. Quince
 * segundos son de sobra para que su pestaña recoja la orden una vez, incluso
 * con la pestaña de fondo, y no tantos como para pelearse con quien decide
 * volver a hablar.
 */
export const VIGENCIA_DEL_SILENCIO_MS = 15_000;

export function hayQueObedecerElSilencio(
    silenciadoEn: Date | string | null | undefined,
    yaObedecido: string | null,
    ahora: number = Date.now(),
): boolean {
    if (!silenciadoEn) return false;
    const marca = silenciadoEn instanceof Date ? silenciadoEn.getTime() : Date.parse(String(silenciadoEn));
    if (!Number.isFinite(marca)) return false;
    // Ya se obedeció esta misma orden: no se vuelve a callar a quien decidió
    // volver a hablar después. La marca se compara por su valor exacto, que es
    // lo que distingue una orden nueva de la de hace un momento.
    if (yaObedecido === new Date(marca).toISOString()) return false;
    return ahora - marca <= VIGENCIA_DEL_SILENCIO_MS;
}

/**
 * Si a alguien se le ve la mano levantada.
 *
 * Con caducidad, como el silencio, y por un motivo distinto: una mano levantada
 * que no caduca se queda puesta toda la reunión porque a nadie se le ocurre
 * volver a pulsar el botón para bajarla. A los dos minutos ya no dice nada de
 * ahora; si sigue haciendo falta, se vuelve a levantar.
 */
export const VIGENCIA_DE_LA_MANO_MS = 2 * 60_000;

export function tieneLaManoLevantada(
    manoLevantadaEn: Date | string | null | undefined,
    ahora: number = Date.now(),
): boolean {
    if (!manoLevantadaEn) return false;
    const marca =
        manoLevantadaEn instanceof Date
            ? manoLevantadaEn.getTime()
            : Date.parse(String(manoLevantadaEn));
    if (!Number.isFinite(marca)) return false;
    return ahora - marca <= VIGENCIA_DE_LA_MANO_MS;
}
