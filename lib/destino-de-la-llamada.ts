import {
  extractWhatsAppDigits,
  isGroupJid,
  isBroadcastJid,
  isLidJid,
  pickPreferredWhatsAppRemoteJid,
  sinSufijoDeDispositivo,
} from "@/lib/whatsapp-jid";

/**
 * A QUIÉN se le habla —por mensaje o por llamada— cuando el contacto puede no
 * tener número a la vista.
 *
 * # Lo que pasaba
 *
 * Hay contactos que entran a WhatsApp por su usuario y WhatsApp los entrega
 * solo como `96366802022553@lid`. Esos dígitos son un id de PRIVACIDAD, no un
 * teléfono. La IA les contestaba bien (responde por el `@lid` que trae el
 * aviso), pero la plataforma, al llamar, se quedaba con los dígitos
 * (`replace(/\D/g, "")`) y llamaba al «+96366802022553»: un número que no
 * existe. Y la burbuja de esa llamada se guardaba bajo
 * `96366802022553@s.whatsapp.net`, la ficha del contacto se reescribía con ese
 * número falso, y a partir de ahí **responder a mano también fallaba**: la
 * pantalla prefería el «teléfono» y WhatsApp contestaba que ese número no tiene
 * WhatsApp.
 *
 * # La regla
 *
 * El destino es el TELÉFONO real si el contacto lo tiene, y si no, su `@lid`
 * ENTERO. Nunca los dígitos de un `@lid` sueltos: leídos como teléfono son el
 * número de nadie.
 *
 * Y un «teléfono» cuyos dígitos son exactamente los de un `@lid` del MISMO
 * contacto no es un teléfono: es ese `@lid` mal leído (`esTelefonoFalsoDeLid`).
 * Un id de privacidad y un número real no coinciden dígito a dígito, así que
 * esa coincidencia solo sale de haber fabricado el número a partir del id.
 *
 * Es puro: lo usan la cabecera del chat, el menú de llamar, la tarjeta de la
 * llamada, el CRM y las acciones del servidor, y tienen que decidir lo mismo.
 */

const SUFIJO_LID = "@lid";
const SUFIJO_TELEFONO = "@s.whatsapp.net";

/** Por debajo de esto no es un contacto: un «0», un «+57» a medias. */
export const MINIMO_DE_DIGITOS_DEL_DESTINO = 6;

/**
 * Lo que se enseña donde iría el número cuando el contacto no tiene: decir
 * «+96 366802022553» sería enseñar un número que no existe.
 */
export const SIN_NUMERO_VISIBLE = "Sin número visible";

function limpio(valor?: string | null): string {
  return sinSufijoDeDispositivo((valor ?? "").trim());
}

/** El `@lid` de un valor, entero y sin aparato (`D@lid`), o "" si no es uno. */
export function elLidDe(valor?: string | null): string {
  const v = limpio(valor);
  if (!v || !isLidJid(v)) return "";
  const digitos = v.slice(0, -SUFIJO_LID.length).replace(/\D/g, "");
  if (digitos.length < MINIMO_DE_DIGITOS_DEL_DESTINO) return "";
  return `${digitos}${SUFIJO_LID}`;
}

/** El destino es un `@lid` (el contacto no tiene número a la vista). */
export function esDestinoLid(destino?: string | null): boolean {
  return Boolean(elLidDe(destino));
}

function losDigitosDeSusLid(identidades: ReadonlyArray<string | null | undefined>): Set<string> {
  const digitos = new Set<string>();
  for (const valor of identidades) {
    const lid = elLidDe(valor);
    if (lid) digitos.add(lid.slice(0, -SUFIJO_LID.length));
  }
  return digitos;
}

/** Un teléfono (con o sin dominio) con dígitos suficientes, o "" si no lo es. */
function losDigitosDelTelefono(valor?: string | null): string {
  const v = limpio(valor);
  if (!v || isLidJid(v) || isGroupJid(v) || isBroadcastJid(v)) return "";
  const dominio = v.includes("@") ? v.slice(v.indexOf("@")).toLowerCase() : "";
  if (dominio && dominio !== SUFIJO_TELEFONO && dominio !== "@c.us") return "";
  const digitos = extractWhatsAppDigits(v);
  return digitos.length >= MINIMO_DE_DIGITOS_DEL_DESTINO ? digitos : "";
}

/**
 * Un «teléfono» que en realidad son los dígitos de un `@lid` del mismo
 * contacto. Ver el comentario de arriba: es un número fabricado, no uno real.
 */
export function esTelefonoFalsoDeLid(
  valor: string | null | undefined,
  identidades: ReadonlyArray<string | null | undefined>,
): boolean {
  const digitos = losDigitosDelTelefono(valor);
  if (!digitos) return false;
  return losDigitosDeSusLid([valor, ...identidades]).has(digitos);
}

/** Las identidades del contacto sin los teléfonos fabricados a partir de su `@lid`. */
export function sinTelefonosFalsosDeLid<T extends string | null | undefined>(identidades: readonly T[]): T[] {
  const deSusLid = losDigitosDeSusLid(identidades);
  if (deSusLid.size === 0) return [...identidades];
  return identidades.filter((valor) => {
    const digitos = losDigitosDelTelefono(valor);
    return !digitos || !deSusLid.has(digitos);
  });
}

/**
 * Las identidades con las que se DECIDE el destino, sin el PUENTE de los
 * candidatos.
 *
 * `buildWhatsAppJidCandidates` añade a propósito `D@lid` a cada teléfono `D`:
 * sirve para BUSCAR una fila guardada bajo cualquiera de las dos formas, pero
 * ese `D@lid` no existe. Pasado como identidad a `sinTelefonosFalsosDeLid`,
 * hacía que el teléfono REAL pareciera fabricado de «su» `@lid` y se tirara:
 * responder a mano, el recordatorio de una cita escrito desde el chat o llamar
 * desde Chats salían hacia `D@lid`, un contacto que no existe («Esta persona
 * ya no está en WhatsApp»). Fue el 2026-10-02, con 17 conversaciones así.
 *
 * - `observadas`: lo que de verdad trae la fila o la ficha (`remoteJid`,
 *   `remoteJidAlt`, `senderPn`, la llave del último mensaje). Todo cuenta.
 * - `candidatos`: listas YA expandidas (`aliases`, `getChatIdentityCandidates`).
 *   De ahí se cae cualquier `D@lid` cuyo `D` sea un teléfono de la lista, salvo
 *   que ese mismo `@lid` venga también entre las observadas.
 *
 * Al revés no hace falta nada: el puente nunca fabrica un teléfono de un
 * `@lid`, así que un teléfono que aparezca en los candidatos salió de un dato.
 */
export function sinElPuenteDeLosCandidatos(
  observadas: ReadonlyArray<string | null | undefined>,
  candidatos: ReadonlyArray<string | null | undefined> = [],
): string[] {
  const vistas = observadas.map((v) => limpio(v)).filter(Boolean);
  const lidsVistos = new Set(vistas.map((v) => elLidDe(v)).filter(Boolean));
  const telefonos = new Set(
    [...vistas, ...candidatos].map((v) => losDigitosDelTelefono(v)).filter(Boolean),
  );
  const deLosCandidatos = candidatos
    .map((v) => limpio(v))
    .filter(Boolean)
    .filter((v) => {
      const lid = elLidDe(v);
      if (!lid || lidsVistos.has(lid)) return true;
      return !telefonos.has(lid.slice(0, -SUFIJO_LID.length));
    });
  return Array.from(new Set([...vistas, ...deLosCandidatos]));
}

/**
 * El destino de una llamada a partir de TODAS las identidades conocidas del
 * contacto (la ficha, la conversación, sus alias): los dígitos del teléfono
 * real si lo tiene, si no su `D@lid`, y "" si no hay ninguno de los dos.
 *
 * Se decide con las identidades REALES, nunca con el número que se enseña: a
 * un agente se le enseña tapado («+57 300 123 XXXX») y con esos dígitos se
 * llamaba a otro número.
 */
export function elDestinoDeLaLlamada(identidades: ReadonlyArray<string | null | undefined>): string {
  const reales = sinTelefonosFalsosDeLid(identidades);
  for (const valor of reales) {
    const digitos = losDigitosDelTelefono(valor);
    if (digitos) return digitos;
  }
  for (const valor of reales) {
    const lid = elLidDe(valor);
    if (lid) return lid;
  }
  return "";
}

/**
 * Lo que viaja como `phone` entre pantallas y acciones, ya limpio: un `D@lid`
 * se queda como `D@lid` y lo demás se queda en sus dígitos. "" si no sirve.
 *
 * Es la puerta por la que pasa lo que llega de fuera (un evento, una acción de
 * servidor): con `replace(/\D/g, "")` a secas, un `@lid` se convertía aquí en
 * el número de nadie.
 */
export function comoDestino(valor?: string | null): string {
  const lid = elLidDe(valor);
  if (lid) return lid;
  const v = limpio(valor);
  if (!v || isGroupJid(v) || isBroadcastJid(v)) return "";
  const digitos = v.replace(/@.*/, "").replace(/\D/g, "");
  return digitos.length >= MINIMO_DE_DIGITOS_DEL_DESTINO ? digitos : "";
}

/** Los dígitos del destino: los del teléfono, o los del `@lid`. */
export function losDigitosDelDestino(destino?: string | null): string {
  return comoDestino(destino).replace(/\D/g, "");
}

/** Lo que se le manda al servidor de llamadas: `+57…` o el `D@lid` entero. */
export function paraElServidorDeLlamadas(destino?: string | null): string {
  const d = comoDestino(destino);
  if (!d) return "";
  return esDestinoLid(d) ? d : `+${d}`;
}

/** El JID de la conversación del destino: `D@lid` o `57…@s.whatsapp.net`. */
export function elJidDelDestino(destino?: string | null): string {
  const d = comoDestino(destino);
  if (!d) return "";
  return esDestinoLid(d) ? d : `${d}${SUFIJO_TELEFONO}`;
}

/** Cómo se enseña el destino: `+57…`, o «Sin número visible» si es un `@lid`. */
export function elDestinoParaMostrar(destino?: string | null): string {
  const d = comoDestino(destino);
  if (!d) return "";
  return esDestinoLid(d) ? SIN_NUMERO_VISIBLE : `+${d}`;
}

/** Lo que se lee de un chat de la bandeja para decidir a quién se le responde. */
export type ContactoParaResponder = {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  senderPn?: string | null;
  aliases?: ReadonlyArray<string | null | undefined> | null;
  lastMessage?: {
    senderPn?: string | null;
    key?: { remoteJid?: string | null; remoteJidAlt?: string | null; senderPn?: string | null } | null;
  } | null;
};

/**
 * A quién se le ESCRIBE desde la conversación abierta: el teléfono real si lo
 * tiene, si no su `@lid` entero. Lo usan los envíos de Chats (texto, adjunto,
 * nota de voz, respuesta rápida, reenviar).
 *
 * Nunca un «teléfono» fabricado con los dígitos de su `@lid`
 * (`sinTelefonosFalsosDeLid`), y nunca un `@lid` fabricado con los dígitos de
 * su teléfono: los `aliases` vienen expandidos con ese puente y se decide sin
 * él (`sinElPuenteDeLosCandidatos`). Con el puente dentro, el teléfono real se
 * tiraba por «falso» y el mensaje salía a `D@lid`, un contacto que no existe.
 */
export function elJidParaResponder(selectedJid: string, contacto?: ContactoParaResponder | null): string {
  const selected = selectedJid.trim();
  if (!selected) return selected;

  const identidades = sinElPuenteDeLosCandidatos(
    [
      contacto?.senderPn,
      contacto?.remoteJidAlt,
      contacto?.remoteJid,
      contacto?.lastMessage?.key?.remoteJid,
      contacto?.lastMessage?.key?.remoteJidAlt,
      contacto?.lastMessage?.key?.senderPn,
      contacto?.lastMessage?.senderPn,
      selected,
    ],
    contacto?.aliases ?? [],
  );
  const hayLid = identidades.some((valor) => isLidJid(valor));
  if (!hayLid && !contacto?.senderPn) return selected;

  const reales = sinTelefonosFalsosDeLid(identidades);
  return (
    pickPreferredWhatsAppRemoteJid(reales) ||
    (esTelefonoFalsoDeLid(selected, identidades) ? elDestinoDeLaLlamada(identidades) : selected)
  );
}
