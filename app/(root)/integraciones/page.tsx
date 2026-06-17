import { currentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getUserIntegrations } from '@/actions/user-integration-actions'
import { MainIntegraciones } from './_components/MainIntegraciones'

export default async function IntegracionesPage() {
    const user = await currentUser()
    if (!user) redirect('/login')

    const { data } = await getUserIntegrations()

    return <MainIntegraciones initial={data} />
}
