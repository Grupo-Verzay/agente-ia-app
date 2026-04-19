"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { User } from "@prisma/client"
import { getClientsByReseller, assignClientToReseller, removeClientFromReseller } from "@/actions/reseller-action"

interface Props {
    searchParams: { [key: string]: string | undefined },
    user: User[]
    resellers: User[]
    defaultResellerId: string
}

type Client = User

const SectionHeader = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">{title}</Label>
    </div>
);

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
        <Card className="border-border">
            <CardHeader>
                <CardTitle>Gestión de clientes por revendedor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
                <div className="grid gap-2">
                    <Label>Selecciona un revendedor</Label>
                    <Select onValueChange={handleResellerChange} defaultValue={selectedReseller}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona..." />
                        </SelectTrigger>
                        <SelectContent>
                            {resellers.map(r => (
                                <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>


                <div className="flex flex-wrap gap-2">
                    <div className="flex flex-col flex-1 gap-2">
                        <SectionHeader title="Clientes asignados" />

                        <Input
                            placeholder="Escribe el nombre del cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        <ScrollArea className="h-60 border-border rounded-lg p-2">
                            {filteredAssignedClients.map(client => (
                                <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                                    <span>{client.name}</span>
                                    <Button size="sm" variant="destructive" onClick={() => removeClient(client)}>Eliminar</Button>
                                </div>
                            ))}
                            {filteredAssignedClients.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center mt-2">No hay clientes asignados</p>
                            )}
                        </ScrollArea>
                    </div>

                    <div className="flex flex-col flex-1 gap-2">
                        <SectionHeader title="Clientes sin asignar" />

                        <Input
                            placeholder="Escribe el nombre del cliente..."
                            value={searchUnassigned}
                            onChange={(e) => setSearchUnassigned(e.target.value)}
                        />

                        <ScrollArea className="h-60 border-border rounded-lg p-2">
                            {filteredUnassignedClients.map(client => (
                                <div key={client.id} className="flex justify-between items-center p-2 hover:bg-muted rounded">
                                    <span>{client.name}</span>
                                    <Button size="sm" onClick={() => assignClient(client)}>Asignar</Button>
                                </div>
                            ))}
                            {filteredUnassignedClients.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center mt-2">No hay clientes pendientes</p>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}