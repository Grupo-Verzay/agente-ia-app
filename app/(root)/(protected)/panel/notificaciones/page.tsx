import { currentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/rbac'
import { getResellerBillingConfig } from '@/actions/billing/reseller-billing-actions'
import { getPlatformBillingMessages } from '@/actions/admin/site-config-actions'
import { getConnectionAlertConfig } from '@/actions/admin/connection-alert-actions'
import { ResellerBillingForm } from './_components/ResellerBillingForm'
import { PlatformBillingForm } from './_components/PlatformBillingForm'
import { ConnectionAlertForm } from './_components/ConnectionAlertForm'

export default async function NotificacionesPage() {
  const user = await currentUser()

  // Verzay (admin/super_admin) edita los mensajes de cobro de la plataforma y el
  // aviso de desconexión, que es único para toda la instalación.
  if (isAdmin(user?.role)) {
    const [messages, connectionAlert] = await Promise.all([
      getPlatformBillingMessages(),
      getConnectionAlertConfig(),
    ])
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
        <ConnectionAlertForm initial={connectionAlert} />
        <PlatformBillingForm initial={messages} />
      </div>
    )
  }

  // Resellers editan los cobros de SUS clientes (default = idéntico a Verzay).
  const billing = await getResellerBillingConfig()
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
      <ResellerBillingForm initial={billing} />
    </div>
  )
}
