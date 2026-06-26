import { getTrialFollowUpConfig } from '@/actions/trial-followup-actions'
import { getResellerBillingConfig } from '@/actions/billing/reseller-billing-actions'
import { TrialFollowUpForm } from './_components/TrialFollowUpForm'
import { ResellerBillingForm } from './_components/ResellerBillingForm'

export default async function SeguimientosPruebaPage() {
  const [result, billing] = await Promise.all([
    getTrialFollowUpConfig(),
    getResellerBillingConfig(),
  ])
  const config = result.data ?? {
    enabled: true,
    enabled1: true,
    enabled3: true,
    enabled6: true,
    instanceName: '',
    message1: '',
    message3: '',
    message6: '',
  }

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto py-4">
      <TrialFollowUpForm
        initial={{
          enabled: config.enabled,
          enabled1: config.enabled1 ?? true,
          enabled3: config.enabled3 ?? true,
          enabled6: config.enabled6 ?? true,
          instanceName: config.instanceName ?? '',
          message1: config.message1 ?? '',
          message3: config.message3 ?? '',
          message6: config.message6 ?? '',
        }}
      />
      <ResellerBillingForm initial={billing} />
    </div>
  )
}
