'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Phone } from 'lucide-react';
import type { User, WorkflowNode } from '@prisma/client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { updateNodeConfig } from '@/actions/workflow-node-action';
import type { AutomationActionType } from '@/types/workflow-node';
import { getAdvisorsForTaskAction } from '@/actions/task-actions';
import { listTagsAction } from '@/actions/tag-actions';

type Advisor = { id: string; name: string | null; email: string };
type TagItem = { id: number; name: string; color?: string | null };

const LEAD_STATUSES = ['FRIO', 'TIBIO', 'CALIENTE', 'FINALIZADO', 'DESCARTADO'];

// ── Caché compartido: una sola carga de asesores/tags aunque haya varios nodos ─
let advisorsCache: Promise<Advisor[]> | null = null;
const tagsCache = new Map<string, Promise<TagItem[]>>();

const loadAdvisors = () => {
  if (!advisorsCache) {
    advisorsCache = getAdvisorsForTaskAction()
      .then((r) => (r.success && r.data ? r.data : []))
      .catch(() => []);
  }
  return advisorsCache;
};

const loadTags = (userId: string) => {
  if (!tagsCache.has(userId)) {
    tagsCache.set(
      userId,
      listTagsAction(userId)
        .then((r) => (r.success && r.data ? (r.data as TagItem[]) : []))
        .catch(() => []),
    );
  }
  return tagsCache.get(userId)!;
};

export function AutomationNodeConfig({
  node,
  user,
}: {
  node: WorkflowNode;
  user: User;
}) {
  const tipo = node.tipo as AutomationActionType;

  const initialConfig = useMemo<Record<string, unknown>>(() => {
    try {
      return node.message ? JSON.parse(node.message) : {};
    } catch {
      return {};
    }
    // node.message es la fuente persistida; recalcular solo si cambia
  }, [node.message]);

  const [config, setConfig] = useState<Record<string, unknown>>(initialConfig);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const needsAdvisors = tipo === 'assign-advisor' || tipo === 'create-task';
  const needsTags = tipo === 'tag-add' || tipo === 'tag-remove';

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  useEffect(() => {
    let alive = true;
    if (needsAdvisors) loadAdvisors().then((d) => alive && setAdvisors(d));
    if (needsTags) loadTags(user.id).then((d) => alive && setTags(d));
    return () => {
      alive = false;
    };
  }, [needsAdvisors, needsTags, user.id]);

  // Persiste el config completo (merge de la clave que cambió).
  const persist = async (next: Record<string, unknown>) => {
    setConfig(next);
    const res = await updateNodeConfig(node.id, next);
    if (!res?.success) toast.error(res?.message ?? 'No se pudo guardar la configuración');
  };

  const set = (key: string, val: unknown) => persist({ ...config, [key]: val });

  const wrap = (children: React.ReactNode) => (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 nodrag">
      {children}
    </div>
  );

  switch (tipo) {
    case 'tag-add':
    case 'tag-remove':
      return wrap(
        <>
          <Label className="text-xs font-medium text-muted-foreground">Tag</Label>
          <Select
            value={config.tagId != null ? String(config.tagId) : ''}
            onValueChange={(v) => set('tagId', Number(v))}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecciona un tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {tipo === 'tag-add'
              ? 'Agrega este tag al contacto cuando el flujo pase por aquí.'
              : 'Quita este tag del contacto cuando el flujo pase por aquí.'}
          </p>
        </>,
      );

    case 'assign-advisor':
      return wrap(
        <>
          <Label className="text-xs font-medium text-muted-foreground">Asesor</Label>
          <Select
            value={config.advisorId ? String(config.advisorId) : ''}
            onValueChange={(v) => set('advisorId', v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecciona asesor" />
            </SelectTrigger>
            <SelectContent>
              {advisors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Asigna el contacto a este asesor.
          </p>
        </>,
      );

    case 'create-task':
      return wrap(
        <>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Título</Label>
            <Input
              value={String(config.title ?? '')}
              onChange={(e) => setConfig({ ...config, title: e.target.value.toUpperCase() })}
              onBlur={() => persist(config)}
              placeholder="TÍTULO DE LA TAREA"
              className="h-9 uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Descripción (opcional)
            </Label>
            <Textarea
              value={String(config.description ?? '')}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              onBlur={() => persist(config)}
              rows={2}
              placeholder="Descripción..."
              className="resize-none text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Asignar a (opcional)
            </Label>
            <Select
              value={config.advisorId ? String(config.advisorId) : ''}
              onValueChange={(v) => set('advisorId', v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Asesor asignado" />
              </SelectTrigger>
              <SelectContent>
                {advisors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name ?? a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>,
      );

    case 'notify-advisor':
      return wrap(
        <>
          <Label className="text-xs font-medium text-muted-foreground">
            Mensaje (opcional)
          </Label>
          <Textarea
            value={String(config.message ?? '')}
            onChange={(e) => setConfig({ ...config, message: e.target.value })}
            onBlur={() => persist(config)}
            rows={2}
            placeholder="Mensaje de notificación al asesor asignado"
            className="resize-none text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Se envía al WhatsApp del asesor asignado (o al dueño si no hay asesor).
          </p>
        </>,
      );

    case 'change-status':
      return wrap(
        <>
          <Label className="text-xs font-medium text-muted-foreground">
            Nuevo estado del lead
          </Label>
          <Select
            value={config.status ? String(config.status) : ''}
            onValueChange={(v) => set('status', v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecciona estado" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>,
      );

    case 'toggle-ai':
      return wrap(
        <div className="flex items-center gap-3">
          <Switch
            checked={Boolean(config.enabled)}
            onCheckedChange={(v) => set('enabled', v)}
            className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-400"
          />
          <Label className="text-sm font-semibold">
            {config.enabled ? 'Activar agente IA' : 'Desactivar agente IA'}
          </Label>
        </div>,
      );

    case 'webhook':
      return wrap(
        <>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">URL</Label>
            <Input
              value={String(config.url ?? '')}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
              onBlur={() => persist(config)}
              placeholder="https://..."
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Método</Label>
            <Select
              value={String(config.method ?? 'POST')}
              onValueChange={(v) => set('method', v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['POST', 'GET', 'PUT', 'PATCH'].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Se envía sessionId, remoteJid y userId del contacto en el cuerpo.
          </p>
        </>,
      );

    case 'ai-call':
      return wrap(
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Phone className="h-3.5 w-3.5" /> Llamada de voz con IA
          </p>
          <p>
            La IA llamará automáticamente al número del contacto y conversará por voz. No
            requiere configuración.
          </p>
          <p>
            Requiere: número de llamadas vinculado (Conexión → Llamadas), &quot;Asistente de
            voz IA&quot; activo y créditos.
          </p>
        </div>,
      );

    default:
      return null;
  }
}
