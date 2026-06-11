'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, Edit2, Loader2, Plus, RefreshCw, Search, Trash2,
} from 'lucide-react';
import type { KnowledgeBlock } from '@prisma/client';
import {
  createKnowledgeBlock,
  deleteKnowledgeBlock,
  listKnowledgeBlocks,
  toggleKnowledgeBlock,
  updateKnowledgeBlock,
} from '@/actions/knowledge-block-actions';
import { KnowledgeBaseActionsMenu } from './KnowledgeBaseActionsMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  userId: string;
  refreshKey?: number;
}

interface BlockFormState {
  title: string;
  keywordsRaw: string;
  content: string;
  category: string;
}

const emptyForm: BlockFormState = { title: '', keywordsRaw: '', content: '', category: '' };

export function KnowledgeBaseManagement({ userId, refreshKey }: Props) {
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBlock, setEditBlock] = useState<KnowledgeBlock | null>(null);
  const [form, setForm] = useState<BlockFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBlock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listKnowledgeBlocks(userId);
      setBlocks(data as KnowledgeBlock[]);
    } catch {
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return blocks;
    const q = search.toLowerCase();
    return blocks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
        (b.category?.toLowerCase().includes(q) ?? false),
    );
  }, [blocks, search]);

  const openCreate = () => {
    setEditBlock(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (block: KnowledgeBlock) => {
    setEditBlock(block);
    setForm({
      title: block.title,
      keywordsRaw: block.keywords.join(', '),
      content: block.content,
      category: block.category ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('El título es obligatorio');
    if (!form.content.trim()) return toast.error('El contenido es obligatorio');

    setIsSaving(true);
    try {
      const keywords = form.keywordsRaw
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const data = {
        title: form.title.trim(),
        keywords,
        content: form.content.trim(),
        category: form.category.trim() || undefined,
      };

      if (editBlock) {
        await updateKnowledgeBlock(editBlock.id, userId, data);
        toast.success('Bloque actualizado');
      } else {
        await createKnowledgeBlock(userId, data);
        toast.success('Bloque creado');
      }

      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (block: KnowledgeBlock, isActive: boolean) => {
    try {
      await toggleKnowledgeBlock(block.id, userId, isActive);
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, isActive } : b)));
    } catch {
      toast.error('No se pudo cambiar el estado');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteKnowledgeBlock(deleteTarget.id, userId);
      toast.success('Bloque eliminado');
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Gestión de Base de Conocimiento</CardTitle>
                  <CardDescription className="mt-0.5">
                    {blocks.length} bloque(s) — {blocks.filter((b) => b.isActive).length} activos
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={load} disabled={isLoading} title="Refrescar">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button size="sm" onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nuevo bloque
                </Button>
                <KnowledgeBaseActionsMenu
                  userId={userId}
                  total={blocks.length}
                  activeCount={blocks.filter((b) => b.isActive).length}
                  inactiveCount={blocks.filter((b) => !b.isActive).length}
                  onDataChanged={load}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, keyword o categoría..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8 w-72"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                {blocks.length === 0
                  ? 'No hay bloques aún. Importa desde la pestaña "Importar" o crea uno manualmente.'
                  : 'Sin resultados para esa búsqueda.'}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map((block) => (
                  <div key={block.id} className="py-3 flex items-start gap-3">
                    <Switch
                      checked={block.isActive}
                      onCheckedChange={(v) => handleToggle(block, v)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{block.title}</span>
                        {block.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {block.category}
                          </Badge>
                        )}
                        {!block.isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {block.keywords.slice(0, 8).map((kw) => (
                          <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {kw}
                          </Badge>
                        ))}
                        {block.keywords.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{block.keywords.length - 8}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{block.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(block)}
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(block)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog editar / crear */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg h-[585px] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editBlock ? 'Editar bloque' : 'Nuevo bloque'}</DialogTitle>
            <DialogDescription>
              Define el contenido que el agente IA inyectará cuando el cliente mencione las keywords.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2 pr-1 outline-none">
            <div className="space-y-1.5">
              <Label htmlFor="kb-title" className="text-xs">Título *</Label>
              <Input
                id="kb-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Producto A — Características"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-keywords" className="text-xs">
                Keywords <span className="text-muted-foreground">(separadas por coma)</span>
              </Label>
              <Input
                id="kb-keywords"
                value={form.keywordsRaw}
                onChange={(e) => setForm((f) => ({ ...f, keywordsRaw: e.target.value }))}
                placeholder="producto, precio, disponibilidad, ..."
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                El agente busca estos términos en el mensaje del cliente para decidir si inyectar este bloque.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-category" className="text-xs">
                Categoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="kb-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ej: Productos, FAQs, Servicios"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-content" className="text-xs">Contenido *</Label>
              <Textarea
                id="kb-content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Descripción completa del bloque..."
                className="min-h-36 text-xs font-mono resize-y"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editBlock ? 'Guardar cambios' : 'Crear bloque'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar eliminación */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar bloque</DialogTitle>
            <DialogDescription>
              ¿Eliminar &ldquo;{deleteTarget?.title}&rdquo;? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-2">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
