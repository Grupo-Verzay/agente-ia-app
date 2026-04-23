"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, MessageCircleMore } from "lucide-react";
import {
    SessionWithRegistrosAndTags,
    SimpleTag,
    TipoRegistro,
} from "@/types/session";

import { Registro, Session } from "@prisma/client";
import { BulkActionsDropdown, FilterLeadsByStats, FilterSessionTypes, SessionStatsInterface, SwitchStatus } from "../../sessions/_components";
import { clearAllHistory } from "@/actions/n8n-chat-historial-action";
import { activateAllSessions, deactivateAllSessions, deleteAllSessions, getSessionsCountByUserId } from "@/actions/session-action";
import { deleteSeguimientosByInstanceName } from "@/actions/seguimientos-actions";
import { useRouter } from "next/navigation";
import { ActionsCell } from "../../sessions/_components/Columns";
import { SessionTagsCombobox, TagFilterBar } from "../../tags/components";
import { ResumeCard } from "./ResumeCard";
import { RegistrosTable } from "./RegistrosTable";
import { formatFecha, getTipoLabel } from "../helpers";
import { deleteRegistro } from "@/actions/registro-action";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RegistroUpsertDialog } from './';
import { LeadSeguimientosTab } from './LeadSeguimientosTab';

/* ===== HELPERS ===== */

function getStatusBadgeVariant(status: boolean) {
    return status ? "default" : "destructive";
}

function getDisplayWhatsappFromSession(session: Session) {
    const base = session.remoteJidAlt || session.remoteJid;
    return base.includes("@") ? base.split("@")[0] : base;
}

function getDisplayNombreFromSession(session: Session) {
    return session.pushName || "Sin nombre";
}

/* ===== COMPONENTE PRINCIPAL ===== */
export const LeadsManagement = ({
    sessions,
    userId,
    filter,
    onChangeFilter,
    mutateSessions,
    allTags
}: {
    sessions: SessionWithRegistrosAndTags[];
    userId: string;
    filter: FilterSessionTypes;
    onChangeFilter: (value: FilterSessionTypes) => void;
    mutateSessions: () => void;
    allTags: SimpleTag[];
}) => {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
        sessions[0]?.id ?? null
    );
    const [stats, setStats] = useState<SessionStatsInterface | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

    const [registroOpen, setRegistroOpen] = useState(false);
    const [registroMode, setRegistroMode] = useState<"create" | "edit">("create");
    const [registroTipo, setRegistroTipo] = useState<TipoRegistro>("REPORTE" as any);
    const [registroEditing, setRegistroEditing] = useState<Registro | null>(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [registroToDelete, setRegistroToDelete] = useState<Registro | null>(null);

    const selectedSession = useMemo(
        () => sessions.find((s) => s.id === selectedSessionId) ?? null,
        [sessions, selectedSessionId]
    );

    const filteredSessions = useMemo(() => {
        const term = search.toLowerCase().trim();

        return sessions.filter((s) => {
            // 1) Filtro por etiquetas
            if (selectedTagIds.length > 0) {
                const sessionTagIds = s.tags?.map((t) => t.id) ?? [];
                const hasAnySelectedTag = sessionTagIds.some((id) =>
                    selectedTagIds.includes(id),
                );
                if (!hasAnySelectedTag) return false;
            }

            // 2) Filtro por texto (nombre / whatsapp / JID)
            if (!term) return true;

            const nombre = getDisplayNombreFromSession(s).toLowerCase();
            const whatsapp = getDisplayWhatsappFromSession(s);
            const remoteJid = s.remoteJid.toLowerCase();
            const remoteJidAlt = s.remoteJidAlt?.toLowerCase() || "";

            return (
                nombre.includes(term) ||
                whatsapp.includes(search) ||
                remoteJid.includes(term) ||
                remoteJidAlt.includes(term)
            );
        });
    }, [sessions, search, selectedTagIds]);


    const registros = useMemo(() => {
        const raw = (selectedSession as any)?.registros;
        if (!raw) return [];
        return Array.isArray(raw) ? raw : [raw]; // 👈 convierte objeto único en lista
    }, [selectedSession]);


    const countByTipo = useMemo(() => {
        const counts: Record<TipoRegistro, number> = {
            REPORTE: 0,
            SOLICITUD: 0,
            PEDIDO: 0,
            RECLAMO: 0,
            PAGO: 0,
            RESERVA: 0,
            PRODUCTO: 0,
        };
        for (const r of registros as Registro[]) {
            const tipo = r.tipo as TipoRegistro;
            if (!tipo) continue;
            counts[tipo] = (counts[tipo] ?? 0) + 1;
        }
        return counts;
    }, [registros]);

    const selectedWhatsapp = selectedSession
        ? getDisplayWhatsappFromSession(selectedSession)
        : "";

    const initialSelectedTagIds = selectedSession?.tags?.map((t) => t?.id).filter(Boolean) ?? [];

    const reminders = selectedSession?.seguimientos || 0;
    const sizeReminders = reminders === 0 ? Object.keys(reminders).length : 0;

    useEffect(() => {
        async function fetchStats() {
            const res = await getSessionsCountByUserId(userId);
            if (res.success && res.data) {
                setStats(res.data);
            }
        }
        fetchStats();
    }, [userId]);

    function openCreate(tipo?: TipoRegistro) {
        setRegistroMode("create");
        setRegistroEditing(null);
        if (tipo) setRegistroTipo(tipo);
        setRegistroOpen(true);
    }

    function openEdit(r: Registro) {
        setRegistroMode("edit");
        setRegistroEditing(r);
        setRegistroTipo(r.tipo as any);
        setRegistroOpen(true);
    }

    function askDelete(r: Registro) {
        setRegistroToDelete(r);
        setDeleteOpen(true);
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header fijo */}
            <div className="sticky top-0 z-1">
                <div className="flex justify-between items-center">
                    <div className="container-stats flex flex-1 gap-4 overflow-x-auto">
                        <FilterLeadsByStats
                            stats={stats}
                            filter={filter}
                            onChangeFilter={onChangeFilter}
                        />
                    </div>
                </div>

                <div className="flex flex-1 justify-between p-2">
                    <TagFilterBar
                        allTags={allTags}
                        selectedTagIds={selectedTagIds}
                        onChangeSelected={setSelectedTagIds}
                    />
                </div>
            </div>

            {/* Scroll interno para el content */}
            <div className="flex-1 overflow-y-auto p-2">
                <div className="grid grid-cols-1 gap-4">
                    {/* Layout principal */}
                    <div className="grid gap-4 h-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] lg:h-[calc(100vh-9rem)]">
                        {/* Columna izquierda: Sesiones / Leads */}
                        <div className="flex flex-col gap-3 min-h-0">
                            {/* Buscador */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        className="pl-8 h-8"
                                        placeholder="Buscar por nombre, número o JID..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <BulkActionsDropdown
                                    userId={userId}
                                    onActivateAll={activateAllSessions}
                                    onDeactivateAll={deactivateAllSessions}
                                    onDeleteAll={deleteAllSessions}
                                    onClearHistory={clearAllHistory}
                                    onClearSeguimientos={deleteSeguimientosByInstanceName}
                                    onSuccess={() => router.refresh()}
                                />
                            </div>

                            <Separator />

                            {/* Lista de leads */}
                            <ScrollArea className="flex-1">
                                <div className="flex flex-col gap-1 pr-2">
                                    {filteredSessions.length === 0 && (
                                        <p className="text-muted-foreground py-4 text-center">
                                            No se encontraron leads asociados a la consulta.
                                        </p>
                                    )}

                                    {filteredSessions.map((session) => {
                                        const isSelected = session.id === selectedSessionId;
                                        const displayNombre = getDisplayNombreFromSession(session);
                                        const displayWhatsapp =
                                            getDisplayWhatsappFromSession(session);

                                        return (
                                            <button
                                                key={session.id}
                                                type="button"
                                                onClick={() => setSelectedSessionId(session.id)}
                                                className={[
                                                    "w-full text-left rounded-lg px-3 py-2 border flex flex-col gap-1 transition",
                                                    "hover:bg-accent/60 hover:border-accent",
                                                    isSelected
                                                        ? "bg-accent border-accent"
                                                        : "bg-background border-border",
                                                ].join(" ")}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium truncate">
                                                        {displayNombre}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <SwitchStatus checked={session.status} sessionId={session.id} mutateSessions={mutateSessions} />
                                                        <ActionsCell session={session} />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-0.5 text-muted-foreground">
                                                    <span className="truncate">
                                                        {displayWhatsapp}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Columna derecha: Detalle de lead + registros */}
                        <div className="flex flex-col gap-3 min-h-0">
                            {selectedSession ? (
                                <>
                                    <div className="flex items-center justify-end">
                                        <Button onClick={() => openCreate()} className="h-8">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Nuevo reporte, solicitud, pedido, reclamo, pagos, reserva
                                        </Button>
                                    </div>

                                    {/* Info rápida del lead */}
                                    <div className="flex flex-col gap-2 rounded-lg border-border bg-muted/40 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-muted-foreground">
                                                    Creado
                                                </span>
                                                <span>
                                                    {formatFecha(selectedSession.createdAt)}
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-muted-foreground">
                                                    Flujos
                                                </span>
                                                <div className="flex w-full flex-wrap gap-2">
                                                    <Badge className="text-xs font-semibold">
                                                        {JSON.stringify(selectedSession.flujos)}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-muted-foreground">
                                                    Seguimientos
                                                </span>
                                                <div className="flex w-full flex-wrap gap-2">
                                                    <Badge
                                                    >{sizeReminders}</Badge>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant={
                                                        getStatusBadgeVariant(
                                                            selectedSession.status
                                                        ) as any
                                                    }
                                                    className={`px-1.5 py-0 ${selectedSession.status ? 'bg-green-500' : ''}`}
                                                >
                                                    {selectedSession.status
                                                        ? "Activo"
                                                        : "Inactivo"}
                                                </Badge>
                                                <SessionTagsCombobox
                                                    userId={selectedSession.userId}
                                                    sessionId={selectedSession.id}
                                                    allTags={allTags}
                                                    initialSelectedIds={initialSelectedTagIds}
                                                />
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="icon"
                                                        variant="outline"
                                                        className="h-7 w-7"
                                                    >
                                                        <MessageCircleMore className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>

                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2 mt-1">

                                            {selectedSession.remoteJidAlt && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-muted-foreground">
                                                        remoteJidAlt
                                                    </span>
                                                    <span>{selectedSession.remoteJidAlt}</span>
                                                </div>
                                            )}

                                        </div>

                                        {/* <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                                            {selectedSession.remoteJidAlt && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-muted-foreground">
                                                        remoteJidAlt
                                                    </span>
                                                    <span>{selectedSession.remoteJidAlt}</span>
                                                </div>
                                            )}
                                        </div> */}
                                    </div>

                                    {/* Tabs de registros */}
                                    <Tabs defaultValue="RESUMEN" className="flex flex-col min-h-0">
                                        <TabsList className="flex w-full flex-wrap gap-1 mb-2 overflow-x-auto md:grid md:grid-cols-8">
                                            <TabsTrigger value="RESUMEN" className="px-2">
                                                Resumen
                                            </TabsTrigger>
                                            <TabsTrigger value="REPORTE" className="px-2">
                                                Reportes{" "}
                                                {countByTipo.REPORTE > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.REPORTE})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="SOLICITUD" className="px-2">
                                                Solicitudes{" "}
                                                {countByTipo.SOLICITUD > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.SOLICITUD})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="PEDIDO" className="px-2">
                                                Pedidos{" "}
                                                {countByTipo.PEDIDO > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.PEDIDO})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="RECLAMO" className="px-2">
                                                Reclamos{" "}
                                                {countByTipo.RECLAMO > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.RECLAMO})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="PAGO" className="px-2">
                                                Pagos{" "}
                                                {countByTipo.PAGO > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.PAGO})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="RESERVA" className="px-2">
                                                Reservas{" "}
                                                {countByTipo.RESERVA > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        ({countByTipo.RESERVA})
                                                    </span>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="SEGUIMIENTOS" className="px-2">
                                                Seguimientos
                                            </TabsTrigger>
                                        </TabsList>

                                        {/* TAB RESUMEN */}
                                        <TabsContent
                                            value="RESUMEN"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <ScrollArea className="flex-1 rounded-md">
                                                <div className="flex flex-col gap-3">


                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                        <ResumeCard
                                                            label="Reportes"
                                                            value={countByTipo.REPORTE}
                                                        />
                                                        <ResumeCard
                                                            label="Solicitudes"
                                                            value={countByTipo.SOLICITUD}
                                                        />
                                                        <ResumeCard
                                                            label="Pedidos"
                                                            value={countByTipo.PEDIDO}
                                                        />
                                                        <ResumeCard
                                                            label="Reclamos"
                                                            value={countByTipo.RECLAMO}
                                                        />
                                                        <ResumeCard
                                                            label="Pagos"
                                                            value={countByTipo.PAGO}
                                                        />
                                                        <ResumeCard
                                                            label="Reservas"
                                                            value={countByTipo.RESERVA}
                                                        />
                                                    </div>

                                                    <Separator className="my-1" />

                                                    <div>
                                                        <p className="font-medium mb-1">
                                                            Actividad reciente
                                                        </p>
                                                        {registros.length === 0 ? (
                                                            <p className="text-muted-foreground">
                                                                Este lead aún no tiene registros.
                                                            </p>
                                                        ) : (
                                                            <ul className="flex flex-col gap-1">
                                                                {registros
                                                                    .slice()
                                                                    .sort((a, b) => {
                                                                        const fechaA =
                                                                            a.fecha ?? new Date(0);
                                                                        const fechaB =
                                                                            b.fecha ?? new Date(0);
                                                                        return fechaA < fechaB ? 1 : -1;
                                                                    })
                                                                    .slice(0, 5)
                                                                    .map((r) => (
                                                                        <li
                                                                            key={r.id}
                                                                            className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5"
                                                                        >
                                                                            <div className="flex flex-col gap-0.5">
                                                                                <span className="font-medium">
                                                                                    {getTipoLabel(r.tipo)}
                                                                                </span>
                                                                                <span className="text-muted-foreground line-clamp-2">
                                                                                    {r.resumen ||
                                                                                        r.detalles ||
                                                                                        "Sin detalles"}
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-muted-foreground whitespace-nowrap ml-2">
                                                                                {formatFecha(
                                                                                    r.fecha || ""
                                                                                )}
                                                                            </span>
                                                                        </li>
                                                                    ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                </div>
                                            </ScrollArea>
                                        </TabsContent>

                                        {/* TAB POR TIPO */}
                                        <TabsContent
                                            value="REPORTE"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="REPORTE"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "REPORTE"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}
                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="SOLICITUD"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="SOLICITUD"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "SOLICITUD"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}

                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="PEDIDO"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="PEDIDO"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "PEDIDO"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}

                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="RECLAMO"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="RECLAMO"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "RECLAMO"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}

                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="PAGO"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="PAGO"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "PAGO"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}

                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="RESERVA"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <RegistrosTable
                                                tipo="RESERVA"
                                                registros={registros.filter(
                                                    (r) => r.tipo === "RESERVA"
                                                )}
                                                whatsapp={selectedWhatsapp}
                                                onNew={(t) => openCreate(t as any)}
                                                onEdit={openEdit}
                                                onDelete={askDelete}

                                            />
                                        </TabsContent>

                                        <TabsContent
                                            value="SEGUIMIENTOS"
                                            className="flex-1 min-h-0 mt-0"
                                        >
                                            <LeadSeguimientosTab
                                                sessionId={selectedSession.id}
                                                userId={selectedSession.userId}
                                                remoteJid={selectedSession.remoteJid}
                                                instanceId={selectedSession.instanceId}
                                            />
                                        </TabsContent>
                                    </Tabs>


                                    <RegistroUpsertDialog
                                        open={registroOpen}
                                        onOpenChange={setRegistroOpen}
                                        mode={registroMode}
                                        sessionId={selectedSession.id}
                                        sessionPushName={selectedSession.pushName}
                                        initialTipo={registroTipo as any}
                                        registro={registroEditing}
                                        onSuccess={() => mutateSessions()}
                                    />

                                    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Esta acción no se puede deshacer.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={async () => {
                                                        if (!registroToDelete) return;
                                                        await deleteRegistro(registroToDelete.id);
                                                        setRegistroToDelete(null);
                                                        mutateSessions();
                                                    }}
                                                >
                                                    Eliminar
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>

                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center">
                                    <p className="text-muted-foreground">
                                        Selecciona un lead en la columna izquierda para ver el
                                        detalle.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
