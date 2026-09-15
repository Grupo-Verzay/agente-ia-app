/**
 * Las llaves de OpenAI que pone Verzay, y el reparto de cuentas entre ellas.
 * **Puro**: aquí no entra nada del servidor.
 *
 * Vive aparte de `lib/llaves-de-verzay.ts` porque ese importa Prisma, y de esto
 * tira la pantalla del panel, que es un componente de cliente. Es la misma
 * separación que `lib/adjuntos-de-tarea-tipos.ts`, y por el mismo motivo: con
 * todo en el mismo fichero basta con que alguien cambie un `import type` por un
 * import normal para llevarse Prisma al navegador.
 */

/**
 * Una llave del registro, tal y como la ve la pantalla.
 *
 * **La clave no viaja entera.** Lo que se enseña es `cola`, los últimos cuatro
 * caracteres, que es lo único que hace falta para reconocer cuál es —y es
 * además lo que ya enseñaba `getAiKeyOriginInfo`—. Mandar la clave al navegador
 * sería repartir un secreto de la casa por cada pintado de la tabla.
 */
export type LlaveDeVerzay = {
  id: string;
  nombre: string;
  /** Los últimos 4 caracteres de la clave. Nunca la clave entera. */
  cola: string;
  porDefecto: boolean;
  /** Cuántas cuentas admite. `0` = sin tope. */
  cupo: number;
  activa: boolean;
  /** Cuántas cuentas cuelgan hoy de ella. */
  cuentas: number;
  creadoEn: string;
};

/**
 * ¿Le cabe otra cuenta?
 *
 * Es puro a propósito: lo mismo decide el reparto en el servidor y lo que pinta
 * la pantalla. Con la condición escrita dos veces, la pantalla acaba
 * prometiendo sitio donde el reparto ya no lo ve.
 *
 * Una llave **desactivada nunca tiene sitio**: sigue sirviendo a las cuentas que
 * ya cuelgan de ella, pero no recibe ninguna más. Es justo para lo que está el
 * interruptor.
 */
export function leCabeOtraCuenta(llave: {
  activa: boolean;
  cupo: number;
  cuentas: number;
}): boolean {
  if (!llave.activa) return false;
  if (llave.cupo <= 0) return true; // sin tope
  return llave.cuentas < llave.cupo;
}

/**
 * Cuántas cuentas le quedan libres, o `null` si no tiene tope.
 *
 * Nunca negativo: bajar el cupo por debajo de lo que ya tiene es legítimo
 * —Carlos aprieta una llave que va justa— y eso deja «0 libres», no «-3».
 */
export function cuantasLeQuedan(llave: { cupo: number; cuentas: number }): number | null {
  if (llave.cupo <= 0) return null;
  return Math.max(0, llave.cupo - llave.cuentas);
}

/**
 * La llave que se le pone a una cuenta nueva.
 *
 * El orden lo pide el encargo, y no es indiferente:
 *
 * 1. **La marcada por defecto**, si le cabe. Es la que decide Carlos.
 * 2. Si no le cabe, **la siguiente libre**. Se ordena por cuántas le quedan
 *    —primero las que van más apretadas— para no dejar llaves a medio llenar
 *    repartidas por todas partes. Entre iguales, por nombre, que es estable:
 *    sin criterio de desempate dos llamadas seguidas pueden elegir distinto y
 *    el reparto se vuelve imposible de explicar.
 * 3. Si ninguna tiene sitio, **nada**. Devolver una llena sería pasarse el cupo
 *    en silencio, que es exactamente lo que este reparto viene a evitar.
 *
 * Las llaves **sin tope** van al final de la cola de las que sí lo tienen: son
 * el desagüe, no la primera opción.
 */
export function elegirLaLlave<T extends { activa: boolean; cupo: number; cuentas: number; porDefecto: boolean; nombre: string }>(
  llaves: T[],
): T | null {
  const conSitio = llaves.filter(leCabeOtraCuenta);
  if (!conSitio.length) return null;

  const porDefecto = conSitio.find((l) => l.porDefecto);
  if (porDefecto) return porDefecto;

  const ordenadas = [...conSitio].sort((a, b) => {
    const libresA = cuantasLeQuedan(a);
    const libresB = cuantasLeQuedan(b);
    // Sin tope va después de cualquiera que sí lo tenga.
    if (libresA === null && libresB !== null) return 1;
    if (libresB === null && libresA !== null) return -1;
    if (libresA !== null && libresB !== null && libresA !== libresB) {
      return libresA - libresB;
    }
    return a.nombre.localeCompare(b.nombre);
  });

  return ordenadas[0] ?? null;
}

/** Los últimos 4 caracteres de una clave, que es lo único que se enseña. */
export function colaDeLaClave(clave: string): string {
  const limpia = clave.trim();
  return limpia.length > 4 ? limpia.slice(-4) : limpia;
}
