'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { listExternalClientData } from '@/actions/external-client-data-actions';
import { buildExternalClientDataColumns } from './ExternalClientDataColumns';
import { ExternalClientDataTable } from './ExternalClientDataTable';
import { ExternalClientDataFormDialog } from './ExternalClientDataFormDialog';
import { ExternalClientDataDeleteDialog } from './ExternalClientDataDeleteDialog';
import type { ExternalClientData } from '@/types/external-client-data';

// ─── Types (ISP) ──────────────────────────────────────────────────────────────

interface ClientOption {
  id: string;
  label: string;
  email: string;
}

export interface ExternalClientDataManagementProps {
  clients: ClientOption[];
}

// ─── Component (SRP — orchestrates state & delegates rendering) ───────────────

export function ExternalClientDataManagement({
  clients,
}: ExternalClientDataManagementProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [comboOpen, setComboOpen] = useState(false);
  const [records, setRecords] = useState<ExternalClientData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ExternalClientData | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ExternalClientData | null>(null);

  // ── Data loading (DIP — depends on the server action abstraction) ────────────
  const loadRecords = useCallback(async (userId: string) => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const result = await listExternalClientData(userId, 1, 200);
      setRecords(result.items);
      setTotal(result.total);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadRecords(selectedUserId);
    } else {
      setRecords([]);
      setTotal(0);
    }
  }, [selectedUserId, loadRecords]);

  // ── Action handlers ──────────────────────────────────────────────────────────
  const handleEdit = useCallback((record: ExternalClientData) => {
    setEditRecord(record);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((record: ExternalClientData) => {
    setDeleteRecord(record);
  }, []);

  const handleCreateNew = useCallback(() => {
    setEditRecord(null);
    setFormOpen(true);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false);
    setEditRecord(null);
    if (selectedUserId) loadRecords(selectedUserId);
  }, [selectedUserId, loadRecords]);

  const handleDeleteSuccess = useCallback(() => {
    setDeleteRecord(null);
    if (selectedUserId) loadRecords(selectedUserId);
  }, [selectedUserId, loadRecords]);

  // ── Columns (memoized, receives action handlers) ─────────────────────────────
  const columns = useMemo(
    () => buildExternalClientDataColumns({ onEdit: handleEdit, onDelete: handleDelete }),
    [handleEdit, handleDelete],
  );

  const selectedClient = clients.find((c) => c.id === selectedUserId);

  return (
    <div className="flex flex-col gap-2">
      {/* ── Toolbar sticky ── */}
      <div className="sticky top-0 z-1">
        <div className="flex items-center gap-2">
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                className={cn(
                  'max-w-sm justify-between font-normal',
                  !selectedUserId && 'text-muted-foreground',
                )}
              >
                {selectedUserId
                  ? (() => {
                      const c = clients.find((c) => c.id === selectedUserId);
                      return c ? `${c.label} — ${c.email}` : 'Cliente seleccionado';
                    })()
                  : 'Selecciona un cliente...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar cliente por nombre o email..." />
                <CommandList>
                  <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
                  <CommandGroup>
                    {clients.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.label} ${c.email}`}
                        onSelect={() => {
                          setSelectedUserId(c.id === selectedUserId ? '' : c.id);
                          setComboOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedUserId === c.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="font-medium">{c.label}</span>
                        <span className="ml-2 text-muted-foreground text-xs">{c.email}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedUserId && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadRecords(selectedUserId)}
              disabled={isLoading}
              title="Recargar"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* ── Data table or placeholder ── */}
      {selectedUserId ? (
        isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ExternalClientDataTable
            columns={columns}
            data={records}
            total={total}
            onCreateNew={handleCreateNew}
          />
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Database className="h-12 w-12 opacity-15" />
          <p className="text-sm">Selecciona un cliente para ver sus datos externos.</p>
        </div>
      )}

      {/* ── Dialogs ── */}

      <ExternalClientDataFormDialog
        open={formOpen}
        userId={selectedUserId}
        record={editRecord}
        onSuccess={handleFormSuccess}
        onClose={() => {
          setFormOpen(false);
          setEditRecord(null);
        }}
      />

      <ExternalClientDataDeleteDialog
        record={deleteRecord}
        onSuccess={handleDeleteSuccess}
        onClose={() => setDeleteRecord(null)}
      />
    </div>
  );
}
