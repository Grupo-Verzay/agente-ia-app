import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadChatBootstrapData } from "@/actions/chat-bootstrap-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * La carga inicial de Chats, fuera de la cola de acciones de Next.
 *
 * Mismo motivo que `/api/chats/lista`, que lo explica entero: Next atiende las
 * acciones de servidor de una en una, asi que esta esperaba su turno detras de
 * las cuatro vueltas de la lista. Lo que trae —etiquetas, marcas de borrado,
 * flujos, respuestas rapidas, asesores— es justo lo que deja la pantalla a
 * medio pintar mientras no llega.
 *
 * Los `sessionUserIds` llegan del navegador igual que llegaban a la accion: la
 * superficie es la misma, una accion de servidor se invoca desde una pestaña
 * exactamente igual que una ruta. Quien acota de verdad es cada consulta de
 * dentro, con la sesion del servidor.
 *
 * La sesion se comprueba aqui y no solo en el middleware (ver CLAUDE.md).
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as
    | { sessionUserIds?: unknown }
    | null;
  const sessionUserIds = Array.isArray(cuerpo?.sessionUserIds)
    ? cuerpo!.sessionUserIds.filter((id): id is string => typeof id === "string" && !!id)
    : undefined;

  const resultado = await loadChatBootstrapData({ sessionUserIds });
  return NextResponse.json(resultado);
}
