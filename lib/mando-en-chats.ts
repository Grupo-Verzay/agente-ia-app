import "server-only";

import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";

/**
 * Quién manda dentro del equipo de una cuenta, en Chats.
 *
 * Dos papeles: el `agente`, que atiende lo que le asignan, y el
 * `administrador`, que es la mano derecha del dueño. Lo que **destruye** algo
 * —borrar un chat, borrar un mensaje del teléfono del cliente— es del dueño y
 * de su administrador; el agente participa, pero no manda.
 *
 * Vive aquí porque esa condición ya estaba escrita en `assertCanDeleteChats`
 * (borrar un chat) y **no** en el borrado de mensajes, que preguntaba otra cosa
 * completamente distinta: `user.role === "admin"`, o sea el rol de la
 * PLATAFORMA. Un administrador de cuenta no lo tiene ni lo va a tener, así que
 * el menú le ofrecía «Eliminar» —ahí sí se mira `advisorRole`— y el servidor le
 * contestaba «Solo los administradores pueden eliminar mensajes». Botón abierto,
 * puerta cerrada, que es el mismo fallo que ya costó Clientes, Equipo,
 * Analíticas y los créditos.
 *
 * El documento lo dice desde entonces: **si se añade otra acción destructiva en
 * Chats, va por la misma puerta que las demás, más lo suyo.** Esta es esa
 * puerta.
 */
export function puedeBorrarEnChats(persona: {
    id?: string | null;
    role?: string | null;
    rolDeLaPersona?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
} | null | undefined): boolean {
    if (!persona?.id) return false;

    // Quien manda en la plataforma no se queda fuera por entrar a una cuenta
    // ajena. Va antes de la condicion de `advisorRole`, que es la que lo
    // dejaba fuera.
    if (esSuperAdminDeVerdad(persona)) return true;

    // `ownerId` puesto = se está actuando dentro del equipo de una cuenta. Sin
    // él se actúa como la cuenta misma, y entonces sí.
    if (persona.ownerId && persona.ownerId !== persona.id && persona.advisorRole !== "administrador") {
        return false;
    }

    return true;
}
