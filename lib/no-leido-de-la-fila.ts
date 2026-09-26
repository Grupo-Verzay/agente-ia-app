/**
 * Cuándo una fila de la lista de Chats está SIN LEER.
 *
 * # El fallo del que viene
 *
 * Un contacto escribía y el chat nacía **ya leído**, sin que ningún asesor lo
 * hubiera abierto ni contestado. No era la IA leyéndolo para responder: pasaba
 * igual con la IA apagada.
 *
 * La causa era la pregunta. La fila decidía así:
 *
 * ```ts
 * const isRead = wasSeenPreviously || lastFromMe || isSelected
 *             || (!hasUnreadFromServer && !hasLocalPending);   // ← esta
 * ```
 *
 * O sea: **«si el proveedor no dice que hay no leídos, dalo por leído»**. Y ese
 * dato, para WhatsApp, casi nunca existe:
 *
 *  - Cuando la lista sale de NUESTRA base —toda línea Waha, y cualquier línea
 *    cuando Evolution no contesta o se queda corta— `inboxRowToChat` escribe
 *    `unreadCount: 0` **siempre**, a propósito: lo pone a 1 solo en Telegram y
 *    Meta. Así que `hasUnreadFromServer` es falso para todo, y todo nace leído.
 *  - Y cuando la lista sale de Evolution, ese contador es de Baileys y lo
 *    limpia cualquier cosa que marque el chat como leído en el teléfono o en la
 *    propia sesión. Un dato que unas veces está y otras no **no puede decidir**.
 *
 * El otro mecanismo que había —`pendingUnreadJids`, del hook de avisos— tampoco
 * podía sostenerlo, y conviene saber por qué para no volver a enchufarlo: tenía
 * una ventana de cinco minutos, **descartaba a propósito los chats que aparecen
 * por primera vez** (o sea, un contacto nuevo no salía nunca sin leer), vivía en
 * estado de React —así que una recarga lo vaciaba— y agrupaba por número sin su
 * línea.
 *
 * # La regla, que es una frase
 *
 * > **Un mensaje entrante deja el chat SIN LEER, y solo lo limpia que alguien
 * > abra el chat.** No lo limpia el proveedor, ni que la IA conteste, ni una
 * > vuelta del reloj.
 *
 * Lo que sí sabe de verdad quién abrió qué es `seenMessages` —una marca por
 * línea y chat, con la FECHA de lo último que se vio, en el `localStorage` de
 * este navegador—, que ya existía y no se toca.
 *
 * # Y el CORTE, que es lo que evita la regresión del día uno
 *
 * Con la regla a secas, una cuenta de 3.900 chats abriría la bandeja con miles
 * en rojo el día del despliegue: de los históricos no hay marca, porque
 * `seenMessages` guarda 1.000 entradas y solo de lo que se abrió en ESTE
 * navegador. Un contador que dice 2.900 es peor que uno que falta — es el mismo
 * «99+ sobre una cuenta vacía» que ya costó una vuelta.
 *
 * Así que cada línea tiene **un corte**: la fecha de lo más reciente que ya
 * estaba en la bandeja la primera vez que esta pestaña vio esa línea. Todo lo
 * anterior se da por leído; todo lo que llegue después cuenta.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El corte se siembra UNA vez por línea y no se mueve nunca.** Si se
 *    re-sembrara en cada vuelta con lo más reciente, taparía cada mensaje que
 *    entre y no saldría nada sin leer jamás — el fallo original por la otra
 *    puerta.
 * 2. **Se siembra con la fecha del chat MÁS RECIENTE de esa línea, no con
 *    `now()`.** Con `now()` se abre una ventana: un mensaje que entre entre la
 *    carga y la siembra se daría por leído. Con la fecha del más reciente no
 *    hay ventana, porque lo que llegue después tiene una fecha mayor.
 * 3. **Es por LÍNEA, no una sola global.** Una línea que se conecta mañana
 *    siembra la suya; con un corte global, sus chats históricos saldrían todos
 *    sin leer. Y cabe de sobra: una entrada por línea, no una por chat —sembrar
 *    los 3.900 chats desbordaría el tope de `seenMessages` y podaría justo los
 *    más antiguos, que son los que hay que dar por leídos—.
 *
 * Lo que cuesta se dice: en esa primerísima vuelta, un chat que de verdad
 * estuviera sin leer se da por leído. Una vez por navegador y línea.
 *
 * Es puro: sin red, sin estado y sin nada del navegador.
 */

/** Lo que decide si una fila sale sin leer. Nada más entra en la cuenta. */
export type LoQueDecideElNoLeido = {
  /** Hay un último mensaje que juzgar. Sin él no hay nada que decir. */
  hayUltimoMensaje: boolean;
  /** Lo mandó la línea: el asesor, la IA, un flujo o una campaña. */
  loMandoLaLinea: boolean;
  /** Esta conversación —línea y número— es la que está abierta ahora. */
  estaAbierto: boolean;
  /** La marca de este navegador dice que ya se vio este mensaje. */
  yaSeVio: boolean;
  /** Alguien lo marcó a mano como no leído desde el menú de la fila. */
  marcadoAMano: boolean;
  /** La fecha del último mensaje, en milisegundos. */
  ts: number;
  /** El corte de su línea: lo que ya estaba cuando esta pestaña empezó. */
  corteDeLaLinea: number;
};

/**
 * La única función que dice si una fila está sin leer.
 *
 * El orden de las cinco preguntas no es indiferente: «a mano» va la primera
 * porque es una decisión de la persona y gana sobre todo lo demás —incluido
 * tener el chat abierto—, que es lo que ya hacía `forcedUnreadJids`.
 */
export function elChatEstaSinLeer(lo: LoQueDecideElNoLeido): boolean {
  if (!lo.hayUltimoMensaje) return false;
  if (lo.marcadoAMano) return true;
  // Lo que escribió la propia línea no es un mensaje que leer.
  if (lo.loMandoLaLinea) return false;
  // Con el chat delante, leído.
  if (lo.estaAbierto) return false;
  // La marca del navegador: se abrió después de este mensaje.
  if (lo.yaSeVio) return false;
  // Lo que ya estaba cuando esta pestaña vio la línea por primera vez.
  //
  // `ts > 0` no es una comprobación de cortesía: un chat sin fecha no se puede
  // comparar con el corte, y con `0 <= corte` se daría por leído TODO lo que
  // viniera sin marca de tiempo. Sin fecha se ve de más —una fila en rojo que
  // se limpia abriéndola—, que es el lado que no pierde mensajes.
  if (lo.corteDeLaLinea > 0 && lo.ts > 0 && lo.ts <= lo.corteDeLaLinea) return false;
  return true;
}

/** El corte de cada línea, por su llave. */
export type CortesDeLoYaLeido = ReadonlyMap<string, number>;

/**
 * La llave del corte de una línea.
 *
 * Una fila sin línea cae en la llave vacía, que es una línea más: no se puede
 * quedar fuera del corte o sus chats históricos saldrían todos sin leer.
 */
export function llaveDelCorte(instanceName?: string | null): string {
  return (instanceName ?? "").trim();
}

/** Hasta cuándo se da por leída esa línea. `0` = todavía no se sembró. */
export function elCorteDeLaLinea(
  cortes: CortesDeLoYaLeido,
  instanceName?: string | null,
): number {
  return cortes.get(llaveDelCorte(instanceName)) ?? 0;
}

/**
 * Siembra el corte de las líneas que todavía no lo tienen.
 *
 * Devuelve `null` cuando no hay nada que sembrar —que es el caso de todas las
 * vueltas menos la primera—, para que quien llama no escriba en el navegador ni
 * repinte la lista por gusto. Es el mismo patrón que `desplegarElEspacio`.
 */
export function sembrarLosCortes(
  cortes: CortesDeLoYaLeido,
  filas: ReadonlyArray<{ instanceName?: string | null; ts?: number | null }>,
  /**
   * Ahora, en milisegundos. El corte **no puede quedar en el futuro**.
   *
   * No es una comprobación de cortesía: una marca de tiempo mal sellada —el
   * mismo mensaje llegando en segundos por un camino y en milisegundos por
   * otro, que es un fallo que este repositorio ya pagó dos veces— sembraría el
   * corte de esa línea meses adelante, y **la línea entera se quedaría leída
   * hasta entonces**, sin un solo error por ninguna parte. Es justo el fallo
   * que esto viene a arreglar, con el volumen multiplicado.
   */
  ahora: number,
): Map<string, number> | null {
  const porSembrar = new Map<string, number>();
  for (const fila of filas) {
    const llave = llaveDelCorte(fila.instanceName);
    // Ya sembrada: el corte de una línea NO se mueve nunca. Moverlo es taparle
    // la boca a todo lo que entre a partir de ahora.
    if (cortes.has(llave)) continue;
    const ts = Math.min(Number(fila.ts) || 0, ahora);
    if (ts <= 0) continue;
    if (ts > (porSembrar.get(llave) ?? 0)) porSembrar.set(llave, ts);
  }
  if (porSembrar.size === 0) return null;
  const nuevo = new Map(cortes);
  for (const [llave, ts] of porSembrar) nuevo.set(llave, ts);
  return nuevo;
}
