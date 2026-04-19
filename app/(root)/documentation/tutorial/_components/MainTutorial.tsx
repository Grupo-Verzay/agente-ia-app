'use client';

import { useEffect, useState } from 'react';
import { GuideUrl as Guide, User } from '@prisma/client';
import { getAllGuides, createGuide, updateGuide, deleteGuide } from '@/actions/guide-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Search, Eye } from 'lucide-react';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import Header from '@/components/shared/header';

export const MainTutorial = ({ user }: { user: User }) => {
    const { modules } = useModuleStore();

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
            return toast.error('All fields are required');
        }

        let res;
        if (editingId) {
            res = await updateGuide({ ...form, id: editingId } as any);
        } else {
            res = await createGuide(form as any);
        }

        if (res.success) {
            toast.success(editingId ? 'Guide updated' : 'Guide created');
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
            toast.success('Guide deleted');
            fetchGuides();
        } else {
            toast.error(res.message);
        }

        return res;
    };

    const filteredGuides = guides.filter(guide =>
        guide.title.toLowerCase().includes(filter.toLowerCase()) ||
        guide.path.toLowerCase().includes(filter.toLowerCase())
        // guide.description.toLowerCase().includes(filter.toLowerCase())
    );

    const onDeleteTutorial = (guide: Guide, state: boolean) => {
        setShowDeleteDialog(state);
        setItemDelete(guide);
    };

    return (
        <div className="flex flex-col p-4 gap-6 overflow-hidden">
            <Header
                title="Tutoriales"
            />
            {/* Header y Filtro */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between overflow-hidden">
                <div className="flex flex-1 gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar tutorial..."
                            className="pl-8"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                    {(user?.role === 'admin' || user?.role === 'super_admin') &&
                        <Dialog open={open} onOpenChange={setOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    onClick={() => {
                                        setForm({});         // Limpia campos
                                        setEditingId(null);  // Quita modo edición
                                    }}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Crear Tutorial
                                </Button>
                            </DialogTrigger>

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
                                    <SelectContent>
                                        {modules.map((link) => (
                                            <SelectItem key={link.id} value={link.route}>
                                                {link.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Textarea
                                    placeholder="Breve descripción del tutorial..."
                                    value={form.description || ''}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                />
                                <Button onClick={handleSubmit} className="w-full">
                                    {form.id ? 'Actualizar tutorial' : 'Crear tutorial'}
                                </Button>
                            </DialogContent>
                        </Dialog>
                    }
                </div>
            </div>

            {/* Cards */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <p className="text-muted-foreground">Loading guides...</p>
                </div>
            ) : (
                <div className="flex-1">
                    <div className="max-h-[80vh] overflow-auto py-2">
                        <div className="flex flex-wrap flex-1 gap-2 justify-center">
                            {filteredGuides.length > 0 ? (
                                filteredGuides.map(guide => (
                                    <Card key={guide.id}
                                        className="
                                        flex
                                        flex-col
                                        border-border
                                        transition-all 
                                        duration-300 
                                        hover:shadow-lg 
                                        hover:scale-[1.015] 
                                        hover:border-primary
                                        w-64
                                        ">
                                        <CardHeader>
                                            <CardTitle>{guide.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="flex flex-1 justify-stretch items-center">
                                            <p className="text-muted-foreground">{guide.description}</p>
                                        </CardContent>
                                        <CardFooter className="flex mt-auto gap-2 w-full">
                                            <Button
                                                className="w-full"
                                                onClick={() => window.open(guide.url, "_blank")}
                                                rel="noopener noreferrer"
                                            >
                                                {(user?.role === 'admin' || user?.role === 'super_admin') ? <Eye /> : 'Ver'}
                                            </Button>
                                            {(user?.role === 'admin' || user?.role === 'super_admin') &&
                                                <>
                                                    <Button
                                                        variant="secondary"
                                                        className="w-full"
                                                        onClick={() => handleEdit(guide)}
                                                    >
                                                        <Pencil />
                                                    </Button>

                                                    <Button
                                                        variant="destructive"
                                                        className="w-full"
                                                        onClick={() => onDeleteTutorial(guide, true)}
                                                    >
                                                        <Trash2 />
                                                    </Button>
                                                </>
                                            }
                                        </CardFooter>
                                    </Card>
                                ))
                            ) : (
                                <div className="flex justify-center items-center py-10 col-span-full">
                                    <p className="text-muted-foreground">No guides found.</p>
                                </div>
                            )}
                        </div>
                    </div>
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
