/**
 * ¿Este número es el de una persona autorizada del Modo Dueño?
 *
 * Copia BYTE A BYTE en el motor (`api-webhook/src/utils/identidad-del-dueno.ts`):
 * el backend lo usa para decidir si entra en Modo Dueño y la App lo repite en
 * cada orden. Si se cambia aquí, se cambia allí; un test lo vigila.
 *
 * Antes bastaba con que coincidieran los últimos diez dígitos. Un número de
 * OTRO país con la misma cola (+52 300 123 4567 frente a +57 300 123 4567)
 * entraba como dueño. Ahora:
 *
 * 1. Iguales → sí.
 * 2. Guardado sin código de país (8 a 10 dígitos) → el remitente tiene que
 *    TERMINAR en él. Es el único caso tolerante, y lo cubre el código de
 *    verificación (PIN) para todo lo que escribe.
 * 3. Los dos con código de país → misma cola de diez Y mismo comienzo (dos
 *    primeros dígitos). Absorbe el «1» de México (52 / 521) y el «9» de
 *    Argentina (54 / 549) sin dejar pasar a otro país.
 */

export function soloDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}

export function elNumeroEsDelDueno(
  remitente: string | null | undefined,
  guardado: string | null | undefined,
): boolean {
  const r = soloDigitos(remitente);
  const g = soloDigitos(guardado);
  if (r.length < 8 || g.length < 8) return false;
  if (r === g) return true;
  if (g.length <= 10) return r.length > g.length && r.endsWith(g);
  if (r.length <= 10) return false;
  return r.slice(-10) === g.slice(-10) && r.slice(0, 2) === g.slice(0, 2);
}

/** El mensaje es SOLO un código de verificación de seis dígitos. */
export function esCodigoDeVerificacion(texto: string | null | undefined): boolean {
  return /^\s*\d{3}\s?\d{3}\s*$/.test(String(texto ?? ""));
}

export function elCodigo(texto: string | null | undefined): string {
  return soloDigitos(texto).slice(0, 6);
}
