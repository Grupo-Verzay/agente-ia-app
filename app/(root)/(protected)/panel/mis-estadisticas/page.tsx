import { currentUser } from "@/lib/auth"
import AccessDenied from "@/app/AccessDenied"
import { getResellerAnalytics } from "@/actions/analytics-actions"
import { ResellerAnalytics } from "./_components/ResellerAnalytics"

const MisEstadisticasPage = async () => {
  const user = await currentUser()
  if (!user || user.role !== "reseller") return <AccessDenied />

  const result = await getResellerAnalytics()
  if (!result.success || !result.data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        No se pudieron cargar las estadísticas.
      </div>
    )
  }

  return <ResellerAnalytics data={result.data} />
}

export default MisEstadisticasPage
