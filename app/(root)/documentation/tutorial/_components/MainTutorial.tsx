'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '@/lib/auth';
import { GuideUrl as Guide } from '@prisma/client';
import { getAllGuides, createGuide, updateGuide, deleteGuide } from '@/actions/guide-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { RejillaOrdenable, TarjetaOrdenable } from '@/components/shared/OrdenDeTarjetas';
import { useOrdenPropio } from '@/components/shared/OrdenPropio';
import { CabeceraDeDocumentacion } from '@/components/documentacion/CabeceraDeDocumentacion';
import { REJILLA_DE_DOCUMENTOS, TarjetaDeDocumento } from '@/components/documentacion/TarjetaDeDocumento';
import type { OrdenGuardado } from '@/lib/orden-de-las-tarjetas';
import { coincideConLaBusqueda } from '@/lib/buscar-en-documentacion';
import {
    COMIENZO_DE_LA_DESCRIPCION,
    FINAL_DE_LA_DESCRIPCION,
    TOPE_DE_LA_DESCRIPCION,
    largoDeLaDescripcion,
    porQueNoValeLaDescripcion,
} from '@/lib/tutoriales-del-modulo';

export const MainTutorial = ({ user, ordenInicial }: { user: CurrentUser; ordenInicial?: OrdenGuardado }) => {
    const { modules } = useModuleStore();
    // Cada persona coloca las tarjetas arrastrándolas, como en Módulos.
    const orden = useOrdenPropio('tutoriales', ordenInicial ?? {});

    const [guides, setGuides] = useState<Guide[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState<Partial<Guide>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [itemDelete, setItemDelete] = useState<Guide | null>(null);
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);


    const fetchGuides = async () => {
        setLoading(true);
        const res = await getAllGuides();
        if (res.success) setGuides(res.data ?? []);
        else toast.error(res.message);
        setLoading(false);
    };

    useEffect(() => {
        fetchGuides();
    }, []);

    const handleSubmit = async () => {
        if (!form.title?.trim() || !form.url?.trim() || !form.path?.trim()) {
            return toast.error('Completa el título, el enlace y la pantalla.');
        }
        // La misma regla que el servidor: se dice antes de mandar.
        const motivo = porQueNoValeLaDescripcion(form.description);
        if (motivo) return toast.error(motivo);

        let res;
        if (editingId) {
            res = await updateGuide({ ...form, id: editingId } as Parameters<typeof updateGuide>[0]);
        } else {
            res = await createGuide(form as Parameters<typeof createGuide>[0]);
        }

        if (res.success) {
            toast.success(editingId ? 'Tutorial actualizado' : 'Tutorial creado');
            setOpen(false);
            setForm({});
            setEditingId(null);
            fetchGuides();
        } else {
            toast.error(res.message);
        }
    };

    const handleEdit = (guide: Guide) => {
        setForm(guide);
        setEditingId(guide.id);
        setOpen(true);
    };

    const handleDelete = async (id: string) => {
        const res = await deleteGuide(id);

        if (res.success) {
            toast.success('Tutorial eliminado');
            fetchGuides();
        } else {
            toast.error(res.message);
        }

        return res;
    };

    /**
     * Las pantallas a las que se le puede pegar un tutorial.
     *
     * Dos arreglos sobre lo que había.
     *
     * Uno: se listaba `modules` tal cual, y los módulos que solo agrupan
     * submenús —Contactos, Integraciones, Herramientas, Entrenamiento…— comparten
     * la misma dirección, `#container`. Al desplegable eso le llega como el mismo
     * valor repetido, así que elegir "Entrenamiento" marcaba de golpe las siete
     * que la comparten y guardaba un revoltijo.
     *
     * Dos: `#container` no es una dirección de ninguna pantalla, así que un
     * tutorial guardado ahí no aparece en ningún lado por más que exista. En su
     * lugar se ofrecen las pantallas de dentro, que sí lo son.
     *
     * Las direcciones se guardan como `/admin/...` y se sirven en `/panel/...`,
     * que es la forma con la que hay que compararlas.
     */
    const pantallas = useMemo(() => {
        const vistas = new Map<string, string>();

        for (const modulo of modules) {
            const ruta = (modulo.route ?? '').trim();
            if (ruta.startsWith('/')) {
                if (!vistas.has(ruta)) vistas.set(ruta, modulo.label);
                continue;
            }

            for (const item of modulo.moduleItems ?? []) {
                const url = (item.url ?? '').trim().replace('/admin/', '/panel/');
                if (!url.startsWith('/') || vistas.has(url)) continue;
                vistas.set(url, `${modulo.label} → ${item.title}`);
            }
        }

        return Array.from(vistas, ([path, label]) => ({ path, label })).sort((a, b) =>
            a.label.localeCompare(b.label, 'es'),
        );
    }, [modules]);

    // Sin mirar mayúsculas ni tildes, por el título, la pantalla y la
    // descripción.
    const filteredGuides = guides.filter(guide =>
        coincideConLaBusqueda(filter, guide.title, guide.path, guide.description)
    );

    const onDeleteTutorial = (guide: Guide, state: boolean) => {
        setShowDeleteDialog(state);
        setItemDelete(guide);
    };

    const esAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const colocados = orden.colocar(filteredGuides, (g) => g.id);
    // La lista ENTERA ya colocada: con una búsqueda puesta se arrastran las que
    // se ven y lo escondido conserva su sitio.
    const idsCompletos = orden.colocar(guides, (g) => g.id).map((g) => g.id);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4" data-pantalla-de-tutoriales>
            <CabeceraDeDocumentacion titulo="Tutoriales" />

            {/* La barra de siempre: el buscador a la izquierda y el azul de
                crear a la DERECHA (antes iba pegado al buscador). */}
            <BarraDeAcciones
                buscador={
                    <div className="relative w-56 sm:w-72">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar tutorial..."
                            className="pl-8"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                }
                crear={
                    esAdmin ? (
                        <BotonDeCrear
                            data-crear-tutorial
                            onClick={() => {
                                setForm({});         // Limpia campos
                                setEditingId(null);  // Quita modo edición
                                setOpen(true);
                            }}
                        >
                            Nuevo
                        </BotonDeCrear>
                    ) : undefined
                }
            />

            {esAdmin &&
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="space-y-4">
                        <DialogTitle>{form.id ? 'Editar tutorial' : 'Crear tutorial'}</DialogTitle>
                        <Input
                            placeholder="Título de la guía (e.j., Cómo crear una cuenta)"
                            value={form.title || ''}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                        />
                        <Input
                            placeholder="URL (e.j., https://youtu.be/fP4DlWuwto0)"
                            value={form.url || ''}
                            onChange={e => setForm({ ...form, url: e.target.value })}
                        />
                        <Select
                            value={form.path || ''}
                            onValueChange={(value) => setForm({ ...form, path: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione un modulo/section" />
                            </SelectTrigger>
                            {/* Alto acotado y con scroll: la lista pasa de veinte
                                entradas y sin esto tapaba el botón de crear. */}
                            <SelectContent className="max-h-[50vh]">
                                {pantallas.map((p) => (
                                    <SelectItem key={p.path} value={p.path}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* La descripción de la tarjeta: «Aprende a … en la
                            plataforma», y cabe en una línea. La regla es
                            la de `lib/tutoriales-del-modulo.ts`. */}
                        <div className="space-y-1">
                            <Input
                                data-descripcion-del-tutorial
                                placeholder={`${COMIENZO_DE_LA_DESCRIPCION}[qué aprende]${FINAL_DE_LA_DESCRIPCION}`}
                                value={form.description || ''}
                                maxLength={TOPE_DE_LA_DESCRIPCION}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                            />
                            <div className="flex items-start justify-between gap-2 text-xs">
                                <span className={porQueNoValeLaDescripcion(form.description) ? 'text-destructive' : 'text-muted-foreground'}>
                                    {porQueNoValeLaDescripcion(form.description)
                                        ?? `Formato: «${COMIENZO_DE_LA_DESCRIPCION}[qué aprende]${FINAL_DE_LA_DESCRIPCION}».`}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {largoDeLaDescripcion(form.description)}/{TOPE_DE_LA_DESCRIPCION}
                                </span>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} className="w-full">
                            {form.id ? 'Actualizar tutorial' : 'Crear tutorial'}
                        </Button>
                    </DialogContent>
                </Dialog>
            }

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <p className="text-muted-foreground">Cargando tutoriales…</p>
                </div>
            ) : (
                // La lista se lleva el alto que sobra y hace su propio scroll.
                <div className="flex-1 min-h-0 overflow-auto py-1">
                    {colocados.length > 0 ? (
                        <RejillaOrdenable
                            ids={idsCompletos}
                            puedeOrdenar
                            onMover={(todos, arrastrada, sobre) => void orden.mover(todos, arrastrada, sobre)}
                            className={REJILLA_DE_DOCUMENTOS}
                        >
                            {colocados.map(guide => (
                                <TarjetaOrdenable key={guide.id} id={guide.id} puedeOrdenar asa="derecha" className="h-full">
                                    <TarjetaDeDocumento
                                        conAsa
                                        titulo={guide.title}
                                        // En qué pantalla sale: sin esto no había forma de
                                        // ver a qué módulo quedó pegado un tutorial.
                                        detalle={guide.path}
                                        descripcion={guide.description}
                                        alVer={() => window.open(guide.url, "_blank", "noopener,noreferrer")}
                                        alEditar={esAdmin ? () => handleEdit(guide) : undefined}
                                        alEliminar={esAdmin ? () => onDeleteTutorial(guide, true) : undefined}
                                    />
                                </TarjetaOrdenable>
                            ))}
                        </RejillaOrdenable>
                    ) : (
                        <div className="flex justify-center items-center py-10">
                            <p className="text-muted-foreground">
                                {filter.trim() ? `Ningún tutorial coincide con «${filter.trim()}».` : 'Todavía no hay tutoriales.'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {
                itemDelete &&
                <GenericDeleteDialog
                    open={showDeleteDialog}
                    setOpen={setShowDeleteDialog}
                    itemName={itemDelete.title}
                    itemId={itemDelete.id}
                    mutationFn={(id) => handleDelete(id)}
                    entityLabel={itemDelete.title}
                />
            }
        </div>
    );
}
