import { currentUser } from "@/lib/auth"
import { isReseller } from "@/lib/rbac"
import { cuentaQueManda } from "@/lib/cuenta-que-manda"
import { puedeVerLaAnaliticaDeLaCasa } from "@/lib/analitica-de-la-casa"
import AccessDenied from "@/app/AccessDenied"
import {
  getAnalyticsDeMiCartera,
  getResellerAnalytics,
  getVerzayPlatformAnalytics,
} from "@/actions/analytics-actions"
import { ResellerAnalytics } from "../mis-estadisticas/_components/ResellerAnalytics"
import { VerzayAnalytics } from "./_components/VerzayAnalytics"
import { VigilanciaDeChats } from "./_components/VigilanciaDeChats"
import { leerLaVigilancia } from "@/actions/vigilancia-actions"
import { ActividadDeInstancias } from "./_components/ActividadDeInstancias"
import { leerLaActividadDeInstancias } from "@/actions/actividad-de-instancias-actions"
import { RenovacionMensual } from "./_components/RenovacionMensual"
import { leerLaRenovacionMensual } from "@/actions/renovacion-mensual-actions"

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

  if (!(await puedeVerLaAnaliticaDeLaCasa(user))) {
    // Un reseller ya tiene su cartera por otro camino (sus clientes asignados);
    // el resto del equipo, por `advisor_clients`.
    const mios = isReseller(cuenta.role)
      ? await getResellerAnalytics()
      : await getAnalyticsDeMiCartera()
    if (!mios.success || !mios.data) return <AccessDenied />
    return <ResellerAnalytics data={mios.data} />
  }

  // Las tres consultas internas devuelven `null` a quien no pueda verlas, así
  // que el bloque ni se pinta. La puerta está en la consulta y no aquí: una
  // pantalla no puede abrir más de lo que la consulta deja. Y las cuatro
  // preguntan lo MISMO que el `if` de arriba —`puedeVerLaAnaliticaDeLaCasa`—,
  // que es lo que evita que esta pantalla vuelva a salir a trozos.
  const [result, vigilancia, actividad, renovacion] = await Promise.all([
    getVerzayPlatformAnalytics(),
    leerLaVigilancia(),
    leerLaActividadDeInstancias(),
    leerLaRenovacionMensual(),
  ])

  // El bloque va DENTRO de `VerzayAnalytics`, al final, y no como hermano suyo.
  //
  // No es solo orden: el layout del panel envuelve a sus hijos en un
  // `flex-1 min-h-0 overflow-hidden`, así que **la página no scrollea**; quien
  // scrollea es el contenedor interno de `VerzayAnalytics`. Colgado aquí como
  // hermano, el bloque se quedaba fuera de ese contenedor, tapaba las tarjetas
  // y recortaba todo lo de abajo sin dejar barra para llegar.
  //
  // Si algún día se añade otro bloque a esta pantalla, va por el mismo camino.
  //
  // Los dos van juntos en el mismo hueco: son los dos bloques internos de la
  // casa y comparten el mismo motivo para estar ahí abajo. Actividad va
  // PRIMERA: dice si una línea está muerta ahora mismo, que es más urgente que
  // si Chats tarda un segundo de más en abrir.
  const bloquesInternos =
    vigilancia || actividad || renovacion ? (
      <>
        {actividad ? <ActividadDeInstancias vista={actividad} /> : null}
        {renovacion ? <RenovacionMensual vista={renovacion} /> : null}
        {vigilancia ? <VigilanciaDeChats vista={vigilancia} /> : null}
      </>
    ) : null

  if (!result.success || !result.data) {
    // Aquí tampoco puede ir suelto, por lo mismo: sin un contenedor que
    // scrolle, el bloque se recorta contra el borde de la pantalla.
    return (
      <div className="flex h-full min-w-0 w-full flex-col gap-3 overflow-auto p-1">
        <SinDatos que="las estadísticas de plataforma" />
        {bloquesInternos}
      </div>
    )
  }

  return <VerzayAnalytics data={result.data} vigilancia={bloquesInternos} />
}

export default AnalyticsPage
