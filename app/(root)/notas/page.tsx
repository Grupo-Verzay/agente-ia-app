import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { NotesClient } from './_components/NotesClient'

export const dynamic = 'force-dynamic'

export default async function NotasPage() {
  const user = await currentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-full flex-col">
      <NotesClient userId={user.id} />
    </div>
  )
}
