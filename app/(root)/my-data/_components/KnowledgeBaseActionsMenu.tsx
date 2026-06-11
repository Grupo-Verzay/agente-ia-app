'use client';

import { useState } from 'react';
import { MoreVertical, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  activateAllKnowledgeBlocks,
  deactivateAllKnowledgeBlocks,
  deleteAllKnowledgeBlocks,
  deleteInactiveKnowledgeBlocks,
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
  total: number;
  activeCount: number;
  inactiveCount: number;
  onDataChanged?: () => void;
}

export function KnowledgeBaseActionsMenu({ userId, total, activeCount, inactiveCount, onDataChanged }: Props) {
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);

  const actions: Record<ActionId, { label: string; description: string; confirmLabel: string; tone: 'default' | 'destructive'; disabled: boolean; execute: () => Promise<{ success: boolean; message: string }> }> = {
    'activate-all': {
      label: `Activar todos los bloques (${inactiveCount})`,
      description: `Se activarán ${inactiveCount} bloque(s) inactivos. Comenzarán a ser consultados por el agente.`,
      confirmLabel: 'Activar todos',
      tone: 'default',
      disabled: inactiveCount === 0,
      execute: () => activateAllKnowledgeBlocks(userId),
    },
    'deactivate-all': {
      label: `Desactivar todos los bloques (${activeCount})`,
      description: `Se desactivarán ${activeCount} bloque(s). El agente dejará de consultarlos temporalmente.`,
      confirmLabel: 'Desactivar todos',
      tone: 'destructive',
      disabled: activeCount === 0,
      execute: () => deactivateAllKnowledgeBlocks(userId),
    },
    'delete-inactive': {
      label: `Eliminar bloques inactivos (${inactiveCount})`,
      description: `Se eliminarán ${inactiveCount} bloque(s) inactivos. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar inactivos',
      tone: 'destructive',
      disabled: inactiveCount === 0,
      execute: () => deleteInactiveKnowledgeBlocks(userId),
    },
    'delete-all': {
      label: `Eliminar todos los bloques (${total})`,
      description: `Se eliminarán ${total} bloque(s) de la base de conocimiento. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar todos',
      tone: 'destructive',
      disabled: total === 0,
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
    onDataChanged?.();
    toast.success(result.message, { id: toastId });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Base de Conocimiento</DropdownMenuLabel>

          <DropdownMenuItem
            disabled={actions['activate-all'].disabled}
            onSelect={() => setSelectedAction('activate-all')}
          >
            <RefreshCw className="h-4 w-4" />
            {actions['activate-all'].label}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={actions['deactivate-all'].disabled}
            onSelect={() => setSelectedAction('deactivate-all')}
            className="text-destructive focus:text-destructive"
          >
            <PowerOff className="h-4 w-4" />
            {actions['deactivate-all'].label}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={actions['delete-inactive'].disabled}
            onSelect={() => setSelectedAction('delete-inactive')}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {actions['delete-inactive'].label}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={actions['delete-all'].disabled}
            onSelect={() => setSelectedAction('delete-all')}
            className="text-destructive focus:text-destructive"
          >
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
