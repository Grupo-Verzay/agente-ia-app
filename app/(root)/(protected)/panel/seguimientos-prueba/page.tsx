import { getTrialFollowUpConfig } from '@/actions/trial-followup-actions'
import { DEFAULT_FOLLOW_UP_DAYS, DEFAULT_TRIAL_DAYS } from '@/lib/trial-defaults'
import { TrialFollowUpForm } from './_components/TrialFollowUpForm'

export default async function SeguimientosPruebaPage() {
  const result = await getTrialFollowUpConfig()
  const config = result.data ?? {
    enabled: true,
    enabled1: true,
    enabled3: true,
    enabled6: true,
    instanceName: '',
    message1: '',
    message3: '',
    message6: '',
    trialDays: DEFAULT_TRIAL_DAYS,
    dayOffset1: DEFAULT_FOLLOW_UP_DAYS[0],
    dayOffset2: DEFAULT_FOLLOW_UP_DAYS[1],
    dayOffset3: DEFAULT_FOLLOW_UP_DAYS[2],
  }

  return (
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
        trialDays: config.trialDays ?? DEFAULT_TRIAL_DAYS,
        dayOffset1: config.dayOffset1 ?? DEFAULT_FOLLOW_UP_DAYS[0],
        dayOffset2: config.dayOffset2 ?? DEFAULT_FOLLOW_UP_DAYS[1],
        dayOffset3: config.dayOffset3 ?? DEFAULT_FOLLOW_UP_DAYS[2],
      }}
    />
  )
}
