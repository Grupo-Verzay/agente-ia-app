// Dobles de lo que la pantalla de Verzy lee fuera de ella: la cita (sin
// prospecto), la cuenta de Verzy y la sesión (una cookie cualquiera: la
// plataforma de mentira no la mira).
export async function laCita(): Promise<null> {
    return null;
}
export function elTelefono(): null {
    return null;
}
export async function laCuentaDeVerzy(): Promise<null> {
    return null;
}
export const DURACION_DE_LA_SESION_S = 3600;
export async function lasCookiesDeVerzy() {
    return { cookies: [{ nombre: "sesion-de-banco", valor: "1" }] };
}
