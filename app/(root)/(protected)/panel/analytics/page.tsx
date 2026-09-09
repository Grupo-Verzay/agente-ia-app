import { currentUser } from "@/lib/auth"
import { isAdminLike, isReseller } from "@/lib/rbac"
import { cuentaQueManda } from "@/lib/cuenta-que-manda"
import AccessDenied from "@/app/AccessDenied"
import {
  getAnalyticsDeMiCartera,
  getResellerAnalytics,
  getVerzayPlatformAnalytics,
} from "@/actions/analytics-actions"
import { ResellerAnalytics } from "../mis-estadisticas/_components/ResellerAnalytics"
import { VerzayAnalytics } from "./_components/VerzayAnalytics"

const SinDatos = ({ que }: { que: string }) => (
  <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
    No se pudieron cargar {que}.
  </div>
)

/**
 * Analítica va con Clientes: quien lleva unas cuentas ve cómo van ESAS.
 *
 * El administrador de la plataforma ve la plataforma entera; quien no lo es,
 * su cartera —los clientes que le asignaron, los mismos de la pestaña
 * Clientes—. Antes esta pantalla pedía rol de admin y contestaba «Acceso
 * Denegado» a alguien que sí tenía clientes a su cargo.
 */
const AnalyticsPage = async () => {
  const user = await currentUser()
  if (!user) return <AccessDenied />

  // Por qué cuenta se mira. El administrador de una cuenta actúa por ella, así
  // que ve lo que ella ve: la plataforma entera si es de la casa, su cartera si
  // es un reseller. Con su propio rol —`user`, siempre— caía en la cartera
  // personal, que está vacía, y le salía «Acceso Denegado».
  const cuenta = await cuentaQueManda(user)

  if (!isAdminLike(cuenta.role)) {
    // Un reseller ya tiene su cartera por otro camino (sus clientes asignados);
    // el resto del equipo, por `advisor_clients`.
    const mios = isReseller(cuenta.role)
      ? await getResellerAnalytics()
      : await getAnalyticsDeMiCartera()
    if (!mios.success || !mios.data) return <AccessDenied />
    return <ResellerAnalytics data={mios.data} />
  }

  const result = await getVerzayPlatformAnalytics()
  if (!result.success || !result.data) {
    return <SinDatos que="las estadísticas de plataforma" />
  }

  return <VerzayAnalytics data={result.data} />
}

export default AnalyticsPage
