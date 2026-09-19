'use client'

import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, LayoutGrid, Eye, EyeOff, Layers, Plus } from 'lucide-react';
import { ModuleCardSkeleton } from './ModuleCardSkeleton';
import { toast } from 'sonner';
import { FormModuleValues, ModuleWithItems } from '@/schema/module'
import { ScrollArea } from "@/components/ui/scroll-area"
import { ModuleForm } from "./"
import { Button } from '@/components/ui/button';
import { createModule, updateModule, eliminarModulosAction } from '@/actions/module-actions';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas, CasillaDeTodos, useSeleccionMultiple } from '@/components/shared/AccionesMasivas';
import { SortableModuleList } from './SortableModuleList';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
import { TooltipProvider } from '@/components/ui/tooltip';

export const MainModule = ({ todosLosModulos }: { todosLosModulos: ModuleWithItems[] }) => {
    const router = useRouter();
    // Los de la plataforma entera, que llegan del servidor. NO los del menú
    // lateral: ese va filtrado por persona y aquí se configuran todos.
    const modules = todosLosModulos;

    const [search, setSearch] = useState('');
    const [filteredModules, setFilteredModules] = useState<ModuleWithItems[]>([]);
    const [isPending, startTransition] = useTransition();

    const [modalOpen, setModalOpen] = useState(false);
    const [editModule, setEditModule] = useState<ModuleWithItems | undefined>();

    // La selección se acota a lo que se VE: con un filtro puesto, «todo» no
    // puede llevarse por delante lo que está escondido.
    const { seleccionados, alternar, alternarTodos, estanTodos, limpiar } =
        useSeleccionMultiple(filteredModules.map((m) => m.id));

    const borrarLosMarcados = async (ids: string[]) => {
        const res = await eliminarModulosAction(ids);
        if (!res.success && res.borrados === 0) throw new Error(res.message);
        return { fallaron: res.fallaron };
    };

    const normalizeModule = (moduleComponent: ModuleWithItems): FormModuleValues => ({
        id: moduleComponent.id,
        label: moduleComponent.label,
        // Sin esto, al editar un modulo contenedor se guardaba como si no lo fuera.
        isContainer: moduleComponent.isContainer ?? false,
        route: moduleComponent.route,
        customUrl: moduleComponent.customUrl ?? '',
        icon: moduleComponent.icon,
        adminOnly: moduleComponent.adminOnly,
        requiresPremium: moduleComponent.requiresPremium,
        showInSidebar: moduleComponent.showInSidebar ?? true,
        allowedPlans: moduleComponent.allowedPlans,
        lockedPlans: (moduleComponent as any).lockedPlans ?? [],
        items: moduleComponent.moduleItems.map(item => ({
            url: item.url,
            title: item.title,
            customUrl: item.customUrl ?? undefined,
            lockedPlans: (item as any).lockedPlans ?? [],
        }))
    });

    useEffect(() => {
        const filtered = modules.filter((moduleComponent) =>
            moduleComponent.label.toLowerCase().includes(search.toLowerCase())
        );
        setFilteredModules(filtered);
    }, [search, modules]);

    const handleOpenModal = (module?: ModuleWithItems) => {
        setEditModule(module);
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditModule(undefined);
        setModalOpen(false);
    };

    const onSubmit = (data: FormModuleValues) => {
        toast.loading('Un momento por favor...', { id: 'submit-toast' })
        const isEditing = !!editModule;

        startTransition(async () => {
            try {
                const res = isEditing
                    ? await updateModule(data.id!, data)
                    : await createModule(data);

                if (res.success) {
                    toast.success(res.message, { id: 'submit-toast' });
                } else {
                    toast.error(res.message, { id: 'submit-toast' });
                }

                router.refresh();
                handleCloseModal();
            } catch (error) {
                console.error("onSubmit error", error);
                toast.error("Ocurrió un error al guardar el módulo");
            }
        });
    };

    const visiblesCount = modules.filter(m => m.showInSidebar).length;
    const adminOnlyCount = modules.filter(m => m.adminOnly).length;
    const conSubMenuCount = modules.filter(m => m.moduleItems.length > 0).length;

    return (
        <TooltipProvider delayDuration={120}>
        <div className="flex h-full min-w-0 w-full flex-col gap-2">
            {/* La barra de siempre: buscador y cifras a la izquierda, el azul
                de crear y el `⋯` pegados al borde. Aquí había DOS `ml-auto`
                —uno en las pastillas y otro en el botón— peleándose, y el azul
                acababa flotando en mitad de la fila. */}
            <BarraDeAcciones
                filtros={<>
                <CasillaDeTodos
                    estanTodos={estanTodos}
                    hayAlguno={seleccionados.length > 0}
                    onCambiar={alternarTodos}
                />
                <div className="relative w-64 shrink-0">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar módulo..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <PastillasDeMetricas
                    metricas={[
                        { clave: 'total', icono: <LayoutGrid />, etiqueta: 'Total módulos', valor: modules.length, color: '#3B82F6', ayuda: 'Módulos configurados en la plataforma' },
                        { clave: 'visibles', icono: <Eye />, etiqueta: 'Visibles en sidebar', valor: visiblesCount, color: '#22C55E', ayuda: 'Módulos que aparecen en el menú lateral' },
                        { clave: 'adminOnly', icono: <EyeOff />, etiqueta: 'Solo admin', valor: adminOnlyCount, color: '#8B5CF6', ayuda: 'Módulos restringidos a administradores' },
                        { clave: 'subMenu', icono: <Layers />, etiqueta: 'Con sub-menú', valor: conSubMenuCount, color: '#F59E0B', ayuda: 'Módulos con ítems de sub-navegación' },
                    ]}
                />
                </>}
                crear={<BotonDeCrear onClick={() => handleOpenModal()}>Nuevo</BotonDeCrear>}
                acciones={
                    <AccionesMasivas
                        seleccionados={seleccionados}
                        queSon="módulos"
                        onEliminar={borrarLosMarcados}
                        onTerminar={() => { limpiar(); router.refresh(); }}
                    />
                }
            />

            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isPending ? (
                        <ModuleCardSkeleton />
                    ) : (
                        <SortableModuleList
                            modules={filteredModules}
                            setOpenModule={(_, module) => handleOpenModal(module)}
                            seleccionados={seleccionados}
                            alternarSeleccion={alternar}
                        />
                    )}
                </div>
            </div>

            <AnimatePresence>
                {modalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="w-full max-w-[33rem] p-2"
                        >
                            <Card className="relative shadow-2xl border-border rounded-md bg-background">
                                <CardHeader className="flex items-center justify-between flex-row pb-2">
                                    <CardTitle>
                                        {editModule ? "Editar módulo" : "Crear módulo"}
                                    </CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleCloseModal}
                                    >
                                        <X className="w-5 h-5" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="py-0 px-6">
                                    <ScrollArea className="max-h-[26.5rem] overflow-y-auto">
                                        <ModuleForm
                                            onSubmit={onSubmit}
                                            defaultValues={editModule ? normalizeModule(editModule) : undefined}
                                        />
                                    </ScrollArea>
                                </CardContent>
                                <CardFooter className="pt-4 flex justify-between gap-2">
                                    <Button variant="save" form="module-form" type="submit" className="w-full">
                                        {editModule ? "Guardar cambios" : "Crear módulo"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
        </TooltipProvider>
    );
};
