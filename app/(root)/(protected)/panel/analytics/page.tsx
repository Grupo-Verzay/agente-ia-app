import { currentUser } from "@/lib/auth"
import { isAdminLike } from "@/lib/rbac"
import AccessDenied from "@/app/AccessDenied"
import { getVerzayPlatformAnalytics } from "@/actions/analytics-actions"
import { VerzayAnalytics } from "./_components/VerzayAnalytics"

const AnalyticsPage = async () => {
  const user = await currentUser()
  if (!user || !isAdminLike(user.role)) return <AccessDenied />

  const result = await getVerzayPlatformAnalytics()
  if (!result.success || !result.data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        No se pudieron cargar las estadísticas de plataforma.
      </div>
    )
  }

  return <VerzayAnalytics data={result.data} />
}

export default AnalyticsPage
