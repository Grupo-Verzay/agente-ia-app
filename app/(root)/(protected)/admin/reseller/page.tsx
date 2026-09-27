'use server'

import { currentUser } from "@/lib/auth"
import { MainReseller } from "./_components"
import { db } from "@/lib/db"
import AccessDenied from "@/app/AccessDenied"
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa"
import { CAMPOS_DE_LA_FICHA } from "@/lib/asignacion-de-reseller"

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const ResellerPage = async ({ searchParams }: Props) => {
    const user = await currentUser()

    // La MISMA puerta que las acciones de la pantalla (`lib/mando-de-la-casa.ts`):
    // con dos, la pantalla abre y sus acciones dicen «No autorizado».
    if (!(await mandaEnLaCasaDeVerdad(user))) {
        return <AccessDenied />;
    }

    // Obtener revendedores
    // Solo la ficha corta: la fila entera —contraseña cifrada, claves, token—
    // viajaba al navegador para pintar un nombre en un desplegable.
    const resellers = await db.user.findMany({
        where: { role: "reseller" },
        select: CAMPOS_DE_LA_FICHA,
        orderBy: { name: "asc" },
    })

    // Si no hay revendedores, evita errores en el componente
    if (!resellers.length) {
        return <div>No hay revendedores registrados aún.</div>
    }

    const defaultResellerId = resellers[0].id

    return (
        <MainReseller
            searchParams={searchParams}
            resellers={resellers}
            defaultResellerId={defaultResellerId}
        />
    )
}

export default ResellerPage
