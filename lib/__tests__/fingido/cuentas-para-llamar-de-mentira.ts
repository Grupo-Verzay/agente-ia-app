/**
 * `cuentasParaLlamarAction` para el banco del diálogo en Chromium: devuelve lo
 * que el banco ponga en `window.__opcionesDeLlamada`. Lo que se prueba ahí es
 * el DIÁLOGO —qué se ofrece, qué viene elegido y qué línea viaja al pulsar—;
 * qué cuentas alcanza cada quien lo prueba la mitad contra Postgres.
 */
export async function cuentasParaLlamarAction() {
    const w = globalThis as unknown as { __opcionesDeLlamada?: unknown[] };
    return { success: true as const, opciones: (w.__opcionesDeLlamada ?? []) as never[] };
}
