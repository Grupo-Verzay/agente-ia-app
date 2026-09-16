import { currentUser } from '@/lib/auth'
import { isAdmin, isAdminLike } from '@/lib/rbac'
import { cuentaQueManda } from '@/lib/cuenta-que-manda'
import { getResellerBillingConfig } from '@/actions/billing/reseller-billing-actions'
import { getPlatformBillingMessages } from '@/actions/admin/site-config-actions'
import { getConnectionAlertConfig } from '@/actions/admin/connection-alert-actions'
import { leerElDestinoAction } from '@/actions/tickets-actions'
import { ResellerBillingForm } from './_components/ResellerBillingForm'
import { PlatformBillingForm } from './_components/PlatformBillingForm'
import { ConnectionAlertForm } from './_components/ConnectionAlertForm'
import { DestinoDeTicketsForm } from './_components/DestinoDeTicketsForm'

export default async function NotificacionesPage() {
  const user = await currentUser()

  // El aviso de desconexión lo edita quien manda en la plataforma, y eso incluye
  // a super_admin: `isAdmin` es estricto (solo rol "admin"), así que colgar la
  // tarjeta de él dejaba fuera justo a la cuenta que la pidió. Se usa
  // `isAdminLike` y se pinta en las DOS ramas, para no cambiar de paso qué
  // formulario de cobros ve cada cuenta — eso es otra decisión y no toca aquí.
  // Se pregunta por la CUENTA: su administrador actua por ella, y con su propio
  // rol —`user`— no veia ni el aviso de desconexion ni los mensajes de cobro.
  const cuenta = user ? await cuentaQueManda(user) : { id: '', role: '' }
  const puedeEditarAviso = isAdminLike(cuenta.role)
  const connectionAlert = puedeEditarAviso ? await getConnectionAlertConfig() : null

  // El destino de los tickets es un ajuste de la PLATAFORMA, asi que lo toca la
  // misma gente que el aviso de desconexion.
  const destino = puedeEditarAviso ? await leerElDestinoAction() : null
  const destinoInicial = destino?.success ? (destino.data ?? null) : null

  // Verzay (rol admin) edita los mensajes de cobro de la plataforma.
  if (isAdmin(cuenta.role)) {
    const messages = await getPlatformBillingMessages()
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
        {connectionAlert && <ConnectionAlertForm initial={connectionAlert} />}
        {destinoInicial && <DestinoDeTicketsForm initial={destinoInicial} />}
        <PlatformBillingForm initial={messages} />
      </div>
    )
  }

  // Resellers editan los cobros de SUS clientes (default = idéntico a Verzay).
  const billing = await getResellerBillingConfig()
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
      {connectionAlert && <ConnectionAlertForm initial={connectionAlert} />}
      {destinoInicial && <DestinoDeTicketsForm initial={destinoInicial} />}
      <ResellerBillingForm initial={billing} />
    </div>
  )
}
