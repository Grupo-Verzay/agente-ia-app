'use client'

import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { ModuleCardSkeleton } from './ModuleCardSkeleton';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { toast } from 'sonner';
import { FormModuleValues, ModuleWithItems } from '@/schema/module'
import { ScrollArea } from "@/components/ui/scroll-area"
import { ModuleForm } from "./"
import { Button } from '@/components/ui/button';
import { createModule, updateModule } from '@/actions/module-actions';
import { SortableModuleList } from './SortableModuleList';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';

export const MainModule = () => {
    const router = useRouter();
    const { modules } = useModuleStore();

    const [search, setSearch] = useState('');
    const [filteredModules, setFilteredModules] = useState<ModuleWithItems[]>([]);
    const [isPending, startTransition] = useTransition();

    const [modalOpen, setModalOpen] = useState(false);
    const [editModule, setEditModule] = useState<ModuleWithItems | undefined>();

    const normalizeModule = (moduleComponent: ModuleWithItems): FormModuleValues => ({
        id: moduleComponent.id,
        label: moduleComponent.label,
        route: moduleComponent.route,
        customUrl: moduleComponent.customUrl ?? '',
        icon: moduleComponent.icon,
        adminOnly: moduleComponent.adminOnly,
        requiresPremium: moduleComponent.requiresPremium,
        showInSidebar: moduleComponent.showInSidebar ?? true,
        allowedPlans: moduleComponent.allowedPlans,
        items: moduleComponent.moduleItems.map(item => ({
            url: item.url,
            title: item.title,
            customUrl: item.customUrl ?? undefined,
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

    return (
        <div className="flex flex-col h-full">
            <div className="sticky top-0 z-1 mb-6">
                <div className="flex justify-between items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar módulo..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => handleOpenModal()}>
                        Crear módulo
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {isPending ? (
                        <ModuleCardSkeleton />
                    ) : (
                        <SortableModuleList
                            modules={filteredModules}
                            setOpenModule={(_, module) => handleOpenModal(module)}
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
                            className="w-full max-w-md p-2"
                        >
                            <Card className="relative shadow-2xl border-border rounded-md bg-background">
                                <CardHeader className="flex items-center justify-between flex-row">
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
                                <CardContent className="space-y-4">
                                    <ScrollArea className="max-h-[70vh] overflow-y-auto">
                                        <ModuleForm
                                            onSubmit={onSubmit}
                                            defaultValues={editModule ? normalizeModule(editModule) : undefined}
                                        />
                                    </ScrollArea>
                                </CardContent>
                                <CardFooter>
                                    <Button form="module-form" type="submit" className="w-full">
                                        {editModule ? "Guardar cambios" : "Crear módulo"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};