'use server'

import { currentUser } from "@/lib/auth"
import { MainReseller } from "./_components"
import { db } from "@/lib/db"
import { isAdminLike } from "@/lib/rbac"
import AccessDenied from "@/app/AccessDenied"
import { cuentaQueManda } from "@/lib/cuenta-que-manda"

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const ResellerPage = async ({ searchParams }: Props) => {
    const user = await currentUser()

    // Verificación de permisos
    // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
    // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
    // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
    const cuenta = user ? await cuentaQueManda(user) : null;
    if (!user || !cuenta || !isAdminLike(cuenta.role)) {
        return <AccessDenied />;
    }

    // Obtener revendedores
    const resellers = await db.user.findMany({
        where: { role: "reseller" },
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
