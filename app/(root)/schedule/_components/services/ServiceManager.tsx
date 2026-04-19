"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";

import {
    createService,
    deleteService,
    getServicesByUser,
    updateService,
} from "@/actions/service-action";

//  Types (Prisma)
import type { Service } from "@prisma/client";
import Header from "@/components/shared/header";
import { serviceDefaultMsg } from "./defaultServiceValues";

// ------------------------------------------------------
// Schema & Types
// ------------------------------------------------------
const serviceSchema = z.object({
    name: z.string().min(2, "El nombre es obligatorio"),
    messageText: z.string().min(5, "El mensaje debe ser más descriptivo"),
});

type ServiceFormValues = z.infer<typeof serviceSchema>;

// ------------------------------------------------------
// Hooks utilitarios
// ------------------------------------------------------
function useDebounce<T>(value: T, delay = 350) {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

// ------------------------------------------------------
// Reusable Form Component (Create / Edit)
// ------------------------------------------------------
function ServiceFormDialog({
    userId,
    mode,
    initialData,
    onSaved,
    trigger,
}: {
    userId: string;
    mode: "create" | "edit";
    initialData?: Service | null;
    onSaved?: (saved: Service) => void;
    trigger?: React.ReactNode;
}) {
    const [open, setOpen] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const router = useRouter();

    const form = useForm<ServiceFormValues>({
        resolver: zodResolver(serviceSchema),
        defaultValues: {
            name: initialData?.name ?? "Consulta",
            messageText: initialData?.messageText ?? serviceDefaultMsg,
        },
    });

    const title = mode === "create" ? "Nuevo servicio" : "Editar servicio";
    const description =
        mode === "create"
            ? "Crea un servicio para usarlo en tus flujos de agendamiento."
            : "Actualiza los datos del servicio.";

    const onSubmit = async (values: ServiceFormValues) => {
        try {
            setSubmitting(true);

            const res =
                mode === "create"
                    ? await createService({ ...values, userId })
                    : (initialData
                        ? await updateService({ id: initialData.id, userId, ...values }) // <- incluye userId (tu updateSchema lo exige)
                        : null);

            if (!res) return;

            if (res.success) {
                // Refetch para obtener el Service y respetar onSaved(saved: Service)
                const list = await getServicesByUser(userId);

                if (list.success && list.data && list.data.length) {
                    let saved: Service | undefined;

                    if (mode === "create") {
                        // tu action de list ordena por createdAt desc → el primero es el más reciente
                        saved = list.data[0];
                    } else if (initialData) {
                        saved = list.data.find(s => s.id === initialData.id) ?? list.data[0];
                    }

                    if (saved) {
                        onSaved?.(saved); // <- ahora sí pasamos el Service al padre
                    }
                }

                toast.success(res.message ?? "Guardado exitosamente");
                setOpen(false);
                router.refresh();
            } else {
                toast.error(res.message ?? "No se pudo guardar");
            }
        } catch {
            toast.error("Error al guardar el servicio");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del servicio</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Asesoría técnica" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="messageText"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mensaje automático para WhatsApp</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Ej: ¡Hola! Gracias por agendar. Te atenderemos puntualmente en tu cita."
                                            className="min-h-[110px]"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Este mensaje se enviará automáticamente al confirmar la cita.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

// ------------------------------------------------------
// Item de lista (con acciones Edit / Delete)
// ------------------------------------------------------
function ServiceListItem({ service, onEdited, onDeleted }: {
    service: Service;
    onEdited: (srv: Service) => void;
    onDeleted: (id: string) => void;
}) {
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);

    const handleDelete = async () => {
        try {
            setDeleting(true);
            const res = await deleteService(service.id);
            if (res.success) {
                toast.success(res.message);
                onDeleted(service.id);
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            toast.error("No se pudo eliminar");
        } finally {
            setDeleting(false);
            setConfirmOpen(false);
        }
    };

    return (
        <>
            <Card className="border-border w-full p-2">
                <CardHeader className="p-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                            <CardTitle className="text-base leading-tight">
                                {service.name}
                            </CardTitle>
                            <Badge variant="secondary" className="font-normal max-w-max">ID: {service.id.slice(0, 8)}…</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <ServiceFormDialog
                                userId={service.userId}
                                mode="edit"
                                initialData={service}
                                onSaved={(s) => onEdited(s)}
                                trigger={
                                    <Button variant="outline" size="icon" title="Editar">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                }
                            />

                            <Button
                                variant="destructive"
                                size="icon"
                                title="Eliminar"
                                onClick={() => setConfirmOpen(true)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="text-sm p-0 text-muted-foreground">
                    {service.messageText}
                </CardContent>

            </Card>

            {/* Confirmación de borrado */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar servicio</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. ¿Deseas eliminar
                            &ldquo;{service.name}&rdquo;?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>

    );
}

// ------------------------------------------------------
// Hook de datos: carga y mutaciones con estado local
// ------------------------------------------------------
function useServices(userId: string) {
    const [services, setServices] = React.useState<Service[]>([]);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [error, setError] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        const res = await getServicesByUser(userId);
        if (res.success && res.data) {
            setServices(res.data);
        } else {
            setError(res.message || "No se pudieron cargar los servicios");
        }
        setLoading(false);
    }, [userId]);

    React.useEffect(() => {
        load();
    }, [load]);

    const upsertLocal = (srv: Service) => {
        setServices((prev) => {
            const idx = prev.findIndex((s) => s.id === srv.id);
            if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = srv;
                return copy;
            }
            return [srv, ...prev];
        });
    };

    const removeLocal = (id: string) => {
        setServices((prev) => prev.filter((s) => s.id !== id));
    };

    return { services, loading, error, reload: load, upsertLocal, removeLocal };
}

// ------------------------------------------------------
// Barra de búsqueda y filtro
// ------------------------------------------------------
function ServiceToolbar({
    onCreate,
    query,
    setQuery,
    total,
}: {
    onCreate: React.ReactNode;
    query: string;
    setQuery: (v: string) => void;
    total: number;
}) {
    return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o mensaje…"
                    className="pl-8"
                />
            </div>

            <div className="flex items-center gap-2">
                <Badge variant="outline" className="hidden sm:inline-flex">{total} servicios</Badge>
                {onCreate}
            </div>
        </div>
    );
}

// ------------------------------------------------------
// Estado vacío y carga
// ------------------------------------------------------
function EmptyState({ onCreate }: { onCreate: React.ReactNode }) {
    return (
        <Card className="border-dashed">
            <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                <div className="rounded-full p-3 border"><Plus className="h-5 w-5" /></div>
                <h3 className="text-base font-medium">Aún no tienes servicios</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Crea tu primer servicio para usarlo en tus flujos de agendamiento y
                    automatizar mensajes de confirmación por WhatsApp.
                </p>
                {onCreate}
            </CardContent>
        </Card>
    );
}

function LoadingState() {
    return (
        <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-4 border-border">
                    <div className="flex items-start justify-between">
                        <Skeleton className="h-5 w-40" />
                        <div className="flex gap-2">
                            <Skeleton className="h-9 w-9 rounded-md" />
                            <Skeleton className="h-9 w-9 rounded-md" />
                        </div>
                    </div>
                    <Separator className="my-3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3 mt-2" />
                </Card>
            ))}
        </div>
    );
}

// ------------------------------------------------------
// Componente principal: CRUD + Filtrado
// ------------------------------------------------------
export default function ServiceManager({ userId }: { userId: string }) {
    const { services, loading, error, reload, upsertLocal, removeLocal } = useServices(userId);
    const [query, setQuery] = React.useState("");
    const debouncedQuery = useDebounce(query, 250);

    const filtered = React.useMemo(() => {
        const q = debouncedQuery.trim().toLowerCase();
        if (!q) return services;
        return services.filter((s) =>
            s.name.toLowerCase().includes(q) || s.messageText.toLowerCase().includes(q)
        );
    }, [services, debouncedQuery]);

    return (
        <div className="space-y-4">
            <Header
                title="Servicios"
            />

            <ServiceToolbar
                query={query}
                setQuery={setQuery}
                total={filtered.length}
                onCreate={
                    <ServiceFormDialog
                        userId={userId}
                        mode="create"
                        onSaved={(s) => upsertLocal(s)}
                        trigger={
                            <Button size="sm">
                                <Plus className="h-4 w-4 mr-2" /> Nuevo servicio
                            </Button>
                        }
                    />
                }
            />

            {loading && <LoadingState />}

            {!loading && error && (
                <Card>
                    <CardContent className="py-10 text-center">
                        <p className="text-sm text-destructive">{error}</p>
                        <Button className="mt-3" onClick={reload}>Reintentar</Button>
                    </CardContent>
                </Card>
            )}

            {!loading && !error && services.length === 0 && (
                <EmptyState
                    onCreate={
                        <ServiceFormDialog userId={userId} mode="create" onSaved={(s) => upsertLocal(s)} />
                    }
                />
            )}

            {!loading && !error && services.length > 0 && (
                <div className="flex flex-col gap-2">
                    {filtered.map((service) => (
                        <ServiceListItem
                            key={service.id}
                            service={service}
                            onEdited={(s) => upsertLocal(s)}
                            onDeleted={(id) => removeLocal(id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
