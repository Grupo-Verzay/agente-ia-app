"use client"

import { useCallback } from "react"
import { ClientInterface } from "@/lib/types"
import { QrCodeIcon, PowerIcon, UsersIcon, BadgeCheck } from "lucide-react"
import { LucideIcon } from "lucide-react"
import { PastillasDeMetricas, type Metrica } from "@/components/shared/PastillasDeMetricas"
import { tieneServicioActivo } from "@/lib/clientes-activos"
import type { EstadoDelServicio } from "@/lib/clientes-activos"

interface ClientStatusSummaryProps {
    users: ClientInterface[]
    onFilterChange: (status: StatusKey | null) => void
    /** El filtro puesto ahora, para pintar su pastilla. */
    filtro: StatusKey | null
    /** El estado del servicio, que es el filtro equivalente de «Activos». */
    servicio: EstadoDelServicio
    onServicioChange: (valor: EstadoDelServicio) => void
}

export type StatusKey = "total" | "qrDisconnected" | "qrConnected" | "evoOn" | "evoOff"

interface StatusConfig {
    icon: LucideIcon
    color: string
    tooltip: string
}

/**
 * Las cifras de Clientes, en la barra.
 *
 * Esta barra es **de donde sale el diseño** de `PastillasDeMetricas`: era la
 * única pantalla que ya tenía sus contadores aquí en vez de en tarjetas
 * arriba. Lo que cambia es que ahora usa el componente compartido en vez de su
 * propia fila de `Button`, así que se ve igual que las otras veintiuna.
 *
 * Y de las cinco tarjetas que había encima, **cuatro ya estaban aquí** —Total,
 * QR conectados, Sin conexión QR y Evolution activo—: esas no se duplican, se
 * quedan las que ya existían. La única que no estaba es **Activos**, y entra
 * abajo del todo con su filtro equivalente, el del estado del servicio.
 */
const statusMap: Record<StatusKey, StatusConfig> = {
    total: {
        icon: UsersIcon,
        color: "#64748B",
        tooltip: "Total de clientes",
    },
    qrDisconnected: {
        icon: QrCodeIcon,
        color: "#EF4444",
        tooltip: "QR desconectado",
    },
    qrConnected: {
        icon: QrCodeIcon,
        color: "#22C55E",
        tooltip: "QR conectado",
    },
    evoOn: {
        icon: PowerIcon,
        color: "#22C55E",
        tooltip: "Robot encendido",
    },
    evoOff: {
        icon: PowerIcon,
        color: "#EF4444",
        tooltip: "Robot apagado",
    },
}

const ORDEN: StatusKey[] = ["total", "qrDisconnected", "qrConnected", "evoOn", "evoOff"]

export const ClientStatusPanel = ({
    users,
    onFilterChange,
    filtro,
    servicio,
    onServicioChange,
}: ClientStatusSummaryProps) => {
    const counts = users.reduce<Record<StatusKey, number>>((acc, user) => {
        acc.total += 1
        if (user.qrStatus === true) acc.qrDisconnected += 1
        if (user.qrStatus === false) acc.qrConnected += 1
        if (user.isEvoEnabled === true) acc.evoOn += 1
        if (user.isEvoEnabled === false) acc.evoOff += 1
        return acc
    }, {
        total: 0,
        qrDisconnected: 0,
        qrConnected: 0,
        evoOn: 0,
        evoOff: 0,
    })

    const handleFilter = useCallback((status: StatusKey) => {
        // «Total» es quitar el filtro, no ponerlo. Y volver a pulsar el que ya
        // está puesto también lo quita: un filtro que solo se pone obliga a
        // buscar dónde se apaga.
        if (status === "total" || filtro === status) {
            onFilterChange(null)
        } else {
            onFilterChange(status)
        }
    }, [filtro, onFilterChange])

    const metricas: Metrica[] = ORDEN.map((clave) => {
        const { icon: Icono, color, tooltip } = statusMap[clave]
        return {
            clave,
            icono: <Icono />,
            etiqueta: tooltip,
            valor: counts[clave],
            color,
            alPulsar: () => handleFilter(clave),
            activa: clave === "total" ? filtro === null : filtro === clave,
        }
    })

    // La que NO estaba en la barra y sí en las tarjetas de arriba. Su filtro
    // equivalente es el desplegable de estado del servicio, así que la pastilla
    // lo mueve en vez de quedarse muerta.
    metricas.push({
        clave: "servicioActivo",
        icono: <BadgeCheck />,
        etiqueta: "Activos",
        valor: users.filter(tieneServicioActivo).length,
        color: "#0EA5E9",
        ayuda: "Cuenta habilitada y servicio al día. El resto están deshabilitados, suspendidos, en mora o sin facturación configurada.",
        alPulsar: () => onServicioChange(servicio === "activos" ? "todos" : "activos"),
        activa: servicio === "activos",
    })

    return <PastillasDeMetricas metricas={metricas} />
}
