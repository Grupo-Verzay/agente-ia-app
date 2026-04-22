'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listExternalClientData } from '@/actions/external-client-data-actions';
import { buildExternalClientDataColumns } from '../../(protected)/admin/external-data/_components/ExternalClientDataColumns';
import { ExternalClientDataTable } from '../../(protected)/admin/external-data/_components/ExternalClientDataTable';
import { ExternalClientDataFormDialog } from '../../(protected)/admin/external-data/_components/ExternalClientDataFormDialog';
import { ExternalClientDataDeleteDialog } from '../../(protected)/admin/external-data/_components/ExternalClientDataDeleteDialog';
import type { ExternalClientData } from '@/types/external-client-data';

interface Props {
  userId: string;
}

export function MyDataManagement({ userId }: Props) {
  const [records, setRecords] = useState<ExternalClientData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ExternalClientData | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ExternalClientData | null>(null);

  const loadRecords = useCallback(async () => {
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
  }, [userId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

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
    loadRecords();
  }, [loadRecords]);

  const handleDeleteSuccess = useCallback(() => {
    setDeleteRecord(null);
    loadRecords();
  }, [loadRecords]);

  const columns = useMemo(
    () => buildExternalClientDataColumns({ onEdit: handleEdit, onDelete: handleDelete }),
    [handleEdit, handleDelete],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Mis datos externos</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadRecords}
                disabled={isLoading}
                className="gap-1.5"
              >
                {isLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Actualizar
              </Button>
              <Button size="sm" onClick={handleCreateNew} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Nuevo registro
              </Button>
            </div>
          </div>
          <CardDescription>
            Visualiza y edita los datos que el agente IA usará en tus conversaciones.
            {total > 0 && (
              <span className="ml-1 font-medium text-foreground">{total} registro(s) cargados.</span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando registros...
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Database className="h-8 w-8 opacity-30" />
              <p className="text-sm">No tienes datos externos cargados.</p>
              <p className="text-xs">Usa la pestaña <strong>Importar</strong> para cargar datos desde Google Sheets.</p>
            </div>
          ) : (
            <ExternalClientDataTable columns={columns} data={records} total={total} onCreateNew={handleCreateNew} />
          )}
        </CardContent>
      </Card>

      <ExternalClientDataFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditRecord(null); }}
        userId={userId}
        record={editRecord}
        onSuccess={handleFormSuccess}
      />

      {deleteRecord && (
        <ExternalClientDataDeleteDialog
          record={deleteRecord}
          onClose={() => setDeleteRecord(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
