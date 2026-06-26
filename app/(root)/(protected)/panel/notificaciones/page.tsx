import { getResellerBillingConfig } from '@/actions/billing/reseller-billing-actions'
import { ResellerBillingForm } from './_components/ResellerBillingForm'

export default async function NotificacionesPage() {
  const billing = await getResellerBillingConfig()

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
      <ResellerBillingForm initial={billing} />
    </div>
  )
}
