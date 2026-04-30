"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { User } from "@prisma/client"
import { getClientsByReseller, assignClientToReseller, removeClientFromReseller } from "@/actions/reseller-action"
import { MetricCard } from "@/components/custom/MetricCard"
import { TooltipProvider } from "@/components/ui/tooltip"
import { UserCheck, Users, UserX } from "lucide-react"

interface Props {
    searchParams: { [key: string]: string | undefined },
    user: User[]
    resellers: User[]
    defaultResellerId: string
}

type Client = User

export const MainReseller = ({ searchParams, user, resellers, defaultResellerId }: Props) => {
    const router = useRouter()
    const [selectedReseller, setSelectedReseller] = useState<string>(defaultResellerId);
    const [assignedClients, setAssignedClients] = useState<Client[]>([]);
    const [unassignedClients, setUnassignedClients] = useState<Client[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchUnassigned, setSearchUnassigned] = useState("");
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        if (selectedReseller) {
            getClients(selectedReseller)
        }
    }, [selectedReseller, refreshTrigger])

    const getClients = async (resellerId: string) => {
        const data = await getClientsByReseller(resellerId)
        setAssignedClients(data.assignedClients.filter((c): c is User => c !== null))
        setUnassignedClients(data.unassignedClients.filter((c): c is User => c !== null))
    }

    const handleResellerChange = (resellerId: string) => {
        setSelectedReseller(resellerId)
        getClients(resellerId)
    }

    const assignClient = async (client: Client) => {
        try {
            await assignClientToReseller(client.id, selectedReseller)
            toast.success(`Cliente asignado a ${resellers.find(r => r.id === selectedReseller)?.name}`)
            setRefreshTrigger(prev => prev + 1)
            router.refresh()
        } catch (error) {
            toast.error("Error al asignar el cliente.")
            console.error(error)
        }
    }

    const removeClient = async (client: Client) => {
        try {
            await removeClientFromReseller(client.id, selectedReseller)
            toast.success("Cliente eliminado del revendedor.")
            setRefreshTrigger(prev => prev + 1)
            router.refresh()
        } catch (error) {
            toast.error("Error al eliminar el cliente.")
            console.error(error)
        }
    }

    const filteredAssignedClients = assignedClients.filter(c =>
        (c.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredUnassignedClients = unassignedClients.filter(c =>
        (c.name ?? "").toLowerCase().includes(searchUnassigned.toLowerCase())
    )

    return (
        <TooltipProvider delayDuration={120}>
        <div className="flex h-full min-w-0 flex-col gap-2">
            {/* MetricCards */}
            <div className="flex flex-wrap gap-3">
                <div className="flex-1">
                    <MetricCard
                        icon={<Users className="h-4 w-4" />}
                        label="Total afiliados"
                        value={resellers.length}
                        helper="Revendedores registrados en la plataforma"
                        color="#3B82F6"
                    />
                </div>
                <div className="flex-1">
                    <MetricCard
                        icon={<UserCheck className="h-4 w-4" />}
                        label="Clientes asignados"
                        value={assignedClients.length}
                        helper="Clientes del afiliado seleccionado"
                        color="#22C55E"
                    />
                </div>
                <div className="flex-1">
                    <MetricCard
                        icon={<UserX className="h-4 w-4" />}
                        label="Sin asignar"
                        value={unassignedClients.length}
                        helper="Clientes disponibles para asignar"
                        color="#F59E0B"
                    />
                </div>
            </div>

            {/* Toolbar: selector de revendedor */}
            <div className="sticky top-0 z-1">
                <Select onValueChange={handleResellerChange} defaultValue={selectedReseller}>
                    <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="Selecciona un revendedor..." />
                    </SelectTrigger>
                    <SelectContent>
                        {resellers.map(r => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Dos paneles */}
            <div className="flex flex-1 gap-2 min-h-0">
                {/* Clientes asignados */}
                <Card className="flex-1 border-border flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <span className="font-semibold text-sm">Clientes asignados</span>
                        <Badge variant="secondary">{assignedClients.length}</Badge>
                    </div>
                    <div className="px-4 pb-2">
                        <Input
                            placeholder="Buscar cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <ScrollArea className="flex-1">
                        {filteredAssignedClients.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No hay clientes asignados</p>
                        ) : (
                            filteredAssignedClients.map(client => (
                                <div key={client.id} className="flex justify-between items-center px-4 py-2 border-b border-border hover:bg-muted/50 transition-colors">
                                    <span className="text-sm">{client.name}</span>
                                    <Button size="sm" variant="destructive" onClick={() => removeClient(client)}>Eliminar</Button>
                                </div>
                            ))
                        )}
                    </ScrollArea>
                </Card>

                {/* Clientes sin asignar */}
                <Card className="flex-1 border-border flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <span className="font-semibold text-sm">Clientes sin asignar</span>
                        <Badge variant="secondary">{unassignedClients.length}</Badge>
                    </div>
                    <div className="px-4 pb-2">
                        <Input
                            placeholder="Buscar cliente..."
                            value={searchUnassigned}
                            onChange={(e) => setSearchUnassigned(e.target.value)}
                        />
                    </div>
                    <ScrollArea className="flex-1">
                        {filteredUnassignedClients.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No hay clientes pendientes</p>
                        ) : (
                            filteredUnassignedClients.map(client => (
                                <div key={client.id} className="flex justify-between items-center px-4 py-2 border-b border-border hover:bg-muted/50 transition-colors">
                                    <span className="text-sm">{client.name}</span>
                                    <Button size="sm" onClick={() => assignClient(client)}>Asignar</Button>
                                </div>
                            ))
                        )}
                    </ScrollArea>
                </Card>
            </div>
        </div>
        </TooltipProvider>
    )
}
