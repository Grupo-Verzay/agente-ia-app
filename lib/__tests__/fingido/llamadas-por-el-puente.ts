/**
 * `@/actions/llamadas-actions` visto desde el NAVEGADOR del banco.
 *
 * Una acción de servidor es, para el navegador, un POST que devuelve JSON. Aquí
 * ese POST es `window.__accion`, que Playwright conecta con las acciones de
 * VERDAD corriendo en Node contra Postgres y con la sesión de ESA página. O
 * sea: lo que se finge es el transporte, no lo que hay a cada lado.
 */
type Puente = (nombre: string, args: unknown[]) => Promise<unknown>;

function llamar<T>(nombre: string, args: unknown[]): Promise<T> {
    const puente = (window as unknown as { __accion?: Puente }).__accion;
    if (!puente) throw new Error("el banco no conectó el puente de acciones");
    return puente(nombre, args) as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const llamarAction = (...a: any[]) => llamar<any>("llamarAction", a);
export const atenderLlamadasAction = (...a: any[]) => llamar<any>("atenderLlamadasAction", a);
export const contestarAction = (...a: any[]) => llamar<any>("contestarAction", a);
export const terminarAction = (...a: any[]) => llamar<any>("terminarAction", a);
export const pedirVideoAction = (...a: any[]) => llamar<any>("pedirVideoAction", a);
export const contestarVideoAction = (...a: any[]) => llamar<any>("contestarVideoAction", a);
export const losServidoresDeLlamadaAction = async () => ({
    success: true as const,
    // Sin STUN: las dos páginas están en la misma máquina y se encuentran por
    // sus candidatos locales. Con el STUN de Google, sin red, la recolección
    // esperaría su tope en cada punta para nada.
    ice: [] as RTCIceServer[],
});
