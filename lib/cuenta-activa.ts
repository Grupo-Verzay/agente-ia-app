/**
 * La CUENTA ACTIVA de quien mira: con la que se leen y se guardan los datos
 * de un módulo. Es `effectiveId` —la que ya usan el entrenamiento del agente,
 * Perfil y sus herramientas—, y si falta, la de su dueño o la propia.
 *
 * Por qué hace falta escribirla: `user.id` NO es la cuenta. Para una persona
 * del equipo es SU fila (con `ownerId` puesto), así que lo que se guardara con
 * `user.id` quedaría bajo la persona, donde el agente de la cuenta no lo lee y
 * ningún compañero lo ve. Con «Ingresar» o el conmutador, `id` y `effectiveId`
 * ya son la cuenta elegida, y esto no cambia nada.
 *
 * Puro: se prueba sin base.
 */
export function laCuentaActiva(u: { id: string; ownerId?: string | null; effectiveId?: string | null }): string {
    return u.effectiveId || u.ownerId || u.id;
}
