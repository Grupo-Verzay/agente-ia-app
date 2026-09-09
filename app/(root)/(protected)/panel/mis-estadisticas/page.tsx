import { currentUser } from "@/lib/auth"
import AccessDenied from "@/app/AccessDenied"
import { cuentaQueManda } from "@/lib/cuenta-que-manda"
import { getResellerAnalytics } from "@/actions/analytics-actions"
import { ResellerAnalytics } from "./_components/ResellerAnalytics"

const MisEstadisticasPage = async () => {
  const user = await currentUser()
  // Es de un reseller, y la cuenta manda: su administrador la lleva por el, y
  // preguntandole SU rol —`user`— esta pantalla se le cerraba.
  const cuenta = user ? await cuentaQueManda(user) : null
  if (!user || !cuenta || cuenta.role !== "reseller") return <AccessDenied />

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
