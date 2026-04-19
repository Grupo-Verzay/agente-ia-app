// app/(admin)/services/_components/ServiceList.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { deleteService, getServicesByUser } from "@/actions/service-action"
import { Service } from "@prisma/client"

export const ServiceList = ({ userId }: { userId: string }) => {
    const [services, setServices] = useState<Service[]>([])
    const [loading, setLoading] = useState(false)

    const loadServices = useCallback(async () => {
        setLoading(true)
        const res = await getServicesByUser(userId)
        if (res.success && res.data) {
            setServices(res.data)
        } else {
            toast.error(res.message)
        }
        setLoading(false)
    }, [userId])

    const handleDelete = async (id: string) => {
        const res = await deleteService(id)
        if (res.success) {
            toast.success(res.message)
            void loadServices()
        } else {
            toast.error(res.message)
        }
    }

    useEffect(() => {
        void loadServices()
    }, [loadServices])

    if (loading) return <p className="text-muted-foreground">Cargando servicios...</p>

    if (!services.length) return <p className="text-muted-foreground">No hay servicios configurados aún.</p>

    return (
        <div className="space-y-2">
            {services.map((service) => (
                <Card
                    key={service.id}
                    className="flex justify-between items-center p-4 border-border"
                >
                    <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-sm text-muted-foreground">
                            {service.messageText}
                        </p>
                    </div>
                    <Button
                        onClick={() => handleDelete(service.id)}
                        variant="destructive"
                        size="icon"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </Card>
            ))}
        </div>
    )
}
