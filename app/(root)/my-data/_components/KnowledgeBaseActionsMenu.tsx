'use client';

import { useCallback, useEffect, useState } from 'react';
import { MoreVertical, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  activateAllKnowledgeBlocks,
  deactivateAllKnowledgeBlocks,
  deleteAllKnowledgeBlocks,
  deleteInactiveKnowledgeBlocks,
  getKnowledgeBlockCounts,
} from '@/actions/knowledge-block-actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CrmConfirmActionDialog } from '@/app/(root)/crm/dashboard/components/CrmConfirmActionDialog';

type ActionId = 'activate-all' | 'deactivate-all' | 'delete-inactive' | 'delete-all';

interface Props {
  userId: string;
  refreshKey?: number;
  onDataChanged?: () => void;
}

export function KnowledgeBaseActionsMenu({ userId, refreshKey, onDataChanged }: Props) {
  const [counts, setCounts] = useState({ total: 0, active: 0, inactive: 0 });
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);

  const loadCounts = useCallback(async () => {
    const c = await getKnowledgeBlockCounts(userId);
    setCounts(c);
  }, [userId]);

  useEffect(() => { loadCounts(); }, [loadCounts, refreshKey]);

  const actions: Record<ActionId, { label: string; description: string; confirmLabel: string; tone: 'default' | 'destructive'; disabled: boolean; execute: () => Promise<{ success: boolean; message: string }> }> = {
    'activate-all': {
      label: `Activar todos los bloques (${counts.inactive})`,
      description: `Se activarán ${counts.inactive} bloque(s) inactivos.`,
      confirmLabel: 'Activar todos',
      tone: 'default',
      disabled: counts.inactive === 0,
      execute: () => activateAllKnowledgeBlocks(userId),
    },
    'deactivate-all': {
      label: `Desactivar todos los bloques (${counts.active})`,
      description: `Se desactivarán ${counts.active} bloque(s).`,
      confirmLabel: 'Desactivar todos',
      tone: 'destructive',
      disabled: counts.active === 0,
      execute: () => deactivateAllKnowledgeBlocks(userId),
    },
    'delete-inactive': {
      label: `Eliminar bloques inactivos (${counts.inactive})`,
      description: `Se eliminarán ${counts.inactive} bloque(s) inactivos. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar inactivos',
      tone: 'destructive',
      disabled: counts.inactive === 0,
      execute: () => deleteInactiveKnowledgeBlocks(userId),
    },
    'delete-all': {
      label: `Eliminar todos los bloques (${counts.total})`,
      description: `Se eliminarán ${counts.total} bloque(s). Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar todos',
      tone: 'destructive',
      disabled: counts.total === 0,
      execute: () => deleteAllKnowledgeBlocks(userId),
    },
  };

  const currentAction = selectedAction ? actions[selectedAction] : null;

  const handleConfirm = async () => {
    if (!selectedAction) return;
    const toastId = `kb-action-${selectedAction}`;
    toast.loading('Aplicando cambios...', { id: toastId });
    const result = await actions[selectedAction].execute();
    if (!result.success) {
      toast.error(result.message, { id: toastId });
      throw new Error(result.message);
    }
    await loadCounts();
    onDataChanged?.();
    toast.success(result.message, { id: toastId });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Base de Conocimiento</DropdownMenuLabel>
          <DropdownMenuItem disabled={actions['activate-all'].disabled} onSelect={() => setSelectedAction('activate-all')}>
            <RefreshCw className="h-4 w-4" />
            {actions['activate-all'].label}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={actions['deactivate-all'].disabled} onSelect={() => setSelectedAction('deactivate-all')} className="text-destructive focus:text-destructive">
            <PowerOff className="h-4 w-4" />
            {actions['deactivate-all'].label}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={actions['delete-inactive'].disabled} onSelect={() => setSelectedAction('delete-inactive')} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" />
            {actions['delete-inactive'].label}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={actions['delete-all'].disabled} onSelect={() => setSelectedAction('delete-all')} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" />
            {actions['delete-all'].label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {currentAction && (
        <CrmConfirmActionDialog
          open={selectedAction !== null}
          onOpenChange={(open) => { if (!open) setSelectedAction(null); }}
          title={currentAction.label}
          description={currentAction.description}
          confirmLabel={currentAction.confirmLabel}
          tone={currentAction.tone}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
