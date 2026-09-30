import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { laCuentaActiva } from '@/lib/cuenta-activa'
import { laPersonaQueActua } from '@/lib/chat-de-equipo'
import { canManageWorkspace } from '@/lib/workspace-roles'
import { nombreDelContacto } from '@/lib/pantalla-de-notas'

/**
 * Los contactos con los que se puede vincular una nota («Vincular contacto»).
 *
 * **De qué cuenta son lo decide la SESIÓN, no el navegador.** Antes llegaba un
 * `userId` —el de la NOTA, o sea la persona que la escribió— y se buscaban las
 * conversaciones guardadas bajo esa persona. Una conversación cuelga de la
 * CUENTA, así que para cualquiera del equipo la lista salía siempre vacía:
 * «Sin resultados» con cientos de contactos en la bandeja. Ahora se usa la
 * cuenta activa (`laCuentaActiva`, la misma de Mis datos y del entrenamiento).
 *
 * Y un `agente` ve solo lo SUYO —las conversaciones que lleva—, que es lo que
 * ve en Chats: este buscador no puede ser la forma de listar los contactos de
 * toda la cuenta.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser()
  if (!user?.id) return NextResponse.json({ data: [] }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()

  const cuenta = laCuentaActiva(user)
  const soloLoSuyo = !canManageWorkspace(user)

  try {
    const sessions = await db.session.findMany({
      where: {
        userId: cuenta,
        ...(soloLoSuyo ? { assignedAdvisorId: laPersonaQueActua(user).id } : {}),
        ...(q ? {
          OR: [
            { customName: { contains: q, mode: 'insensitive' } },
            { pushName: { contains: q, mode: 'insensitive' } },
            { remoteJid: { contains: q } },
          ],
        } : {}),
      },
      select: { remoteJid: true, pushName: true, customName: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    })

    const unique = Array.from(
      new Map(sessions.map(s => [s.remoteJid, { remoteJid: s.remoteJid, pushName: nombreDelContacto(s) }])).values()
    )

    return NextResponse.json({ data: unique })
  } catch (e) {
    console.warn('[notas] no se pudieron leer los contactos para vincular', { cuenta, error: String(e) })
    return NextResponse.json({ data: [] })
  }
}
