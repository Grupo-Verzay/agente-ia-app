import { getTrialFollowUpConfig } from '@/actions/trial-followup-actions'
import { TrialFollowUpForm } from './_components/TrialFollowUpForm'

export default async function SeguimientosPruebaPage() {
  const result = await getTrialFollowUpConfig()
  const config = result.data ?? { enabled: true, instanceName: '', message1: '', message3: '', message6: '' }

  return (
    <TrialFollowUpForm
      initial={{
        enabled: config.enabled,
        instanceName: config.instanceName ?? '',
        message1: config.message1 ?? '',
        message3: config.message3 ?? '',
        message6: config.message6 ?? '',
      }}
    />
  )
}
