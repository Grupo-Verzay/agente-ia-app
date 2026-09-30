'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, Loader2, RefreshCw, Search,
} from 'lucide-react';
import type { KnowledgeBlock } from '@prisma/client';
import {
  createKnowledgeBlock,
  deleteKnowledgeBlock,
  listKnowledgeBlocks,
  toggleKnowledgeBlock,
  updateKnowledgeBlock,
} from '@/actions/knowledge-block-actions';
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
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { EditarYEliminar } from '@/components/shared/EditarYEliminar';

interface Props {
  userId: string;
  refreshKey?: number;
  onDataChanged?: () => void;
}

interface BlockFormState {
  title: string;
  keywordsRaw: string;
  content: string;
  category: string;
}

const emptyForm: BlockFormState = { title: '', keywordsRaw: '', content: '', category: '' };

export function KnowledgeBaseManagement({ userId, refreshKey, onDataChanged }: Props) {
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
    } catch (error) {
      console.error('[mis-datos] no se pudieron leer los bloques', error);
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Después de crear, editar o borrar se avisa a la sección: vuelve a leer la
  // lista (por `refreshKey`) y el «⋯» vuelve a contar. Sin sección, se relee aquí.
  const cambio = () => (onDataChanged ? onDataChanged() : void load());

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
      cambio();
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
      cambio();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div data-gestionar="knowledge" className="space-y-4">
        <Card>
          {/* La MISMA forma que la tarjeta de los datos importados: su título,
              su frase con el número y «Actualizar» a la derecha. Arriba iban
              además «Nuevo bloque» y, debajo, el buscador suelto. */}
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Bloques de conocimiento</CardTitle>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={load}
                disabled={isLoading}
                title="Actualizar"
                aria-label="Actualizar"
              >
                {isLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <CardDescription>
              Revisa y edita los bloques que el agente IA consulta en tus conversaciones.
              {blocks.length > 0 && (
                <span data-cuenta-de-bloques className="ml-1 font-medium text-foreground">
                  {blocks.length} bloque(s), {blocks.filter((b) => b.isActive).length} activo(s).
                </span>
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* La barra de la plataforma, como la tabla de datos importados:
                el buscador primero y «Nuevo» en azul a la derecha. */}
            <BarraDeAcciones
              buscador={
                <div className="relative w-56 shrink-0 sm:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar por título o clave..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 text-xs"
                  />
                </div>
              }
              crear={<BotonDeCrear onClick={openCreate}>Nuevo</BotonDeCrear>}
            />

            {isLoading && blocks.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando bloques...
              </div>
            ) : filtered.length === 0 ? (
              blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <BookOpen className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No tienes bloques todavía.</p>
                  <p className="text-xs">Usa la pestaña <strong>Importar</strong> para dividir tu contenido en bloques, o crea uno con <strong>Nuevo</strong>.</p>
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  Ningún bloque coincide con la búsqueda.
                </div>
              )
            ) : (
              <div data-lista-de-bloques className="divide-y divide-border/50">
                {filtered.map((block) => (
                  <div key={block.id} data-bloque={block.title} className="py-3 flex items-start gap-3">
                    <Switch
                      checked={block.isActive}
                      onCheckedChange={(v) => handleToggle(block, v)}
                      className="mt-0.5 shrink-0"
                      aria-label={block.isActive ? 'Desactivar bloque' : 'Activar bloque'}
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
                    <EditarYEliminar onEditar={() => openEdit(block)} onEliminar={() => setDeleteTarget(block)} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog editar / crear */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editBlock ? 'Editar bloque' : 'Nuevo bloque'}</DialogTitle>
            <DialogDescription>
              Define el contenido que el agente IA usará cuando el cliente mencione sus palabras clave.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2 pr-1 outline-none">
            <div className="space-y-1.5">
              <Label htmlFor="kb-title" className="text-xs">Título *</Label>
              <Input
                id="kb-title"
                value={form.title}
                // Tal cual se escribe. Iba en mayúsculas —con CSS y convertido al
                // teclear—, así que un bloque importado («Horarios de atención») se
                // VEÍA en mayúsculas al editarlo y, con tocar una letra, se guardaba
                // así sin decirlo; y uno creado a mano salía distinto de los
                // importados en la misma lista.
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Producto A — Características"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-keywords" className="text-xs">
                Palabras clave <span className="text-muted-foreground">(separadas por coma)</span>
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
            {/* Crear va en azul y guardar en verde, como en toda la plataforma. */}
            <Button variant={editBlock ? 'save' : 'default'} onClick={handleSave} disabled={isSaving} className="gap-2">
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
