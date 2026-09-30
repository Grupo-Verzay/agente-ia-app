'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listExternalClientData } from '@/actions/external-client-data-actions';
import { buildExternalClientDataColumns } from '../../(protected)/admin/external-data/_components/ExternalClientDataColumns';
import { ExternalClientDataTable } from '../../(protected)/admin/external-data/_components/ExternalClientDataTable';
import { ExternalClientDataFormDialog } from '../../(protected)/admin/external-data/_components/ExternalClientDataFormDialog';
import { ExternalClientDataDeleteDialog } from '../../(protected)/admin/external-data/_components/ExternalClientDataDeleteDialog';
import type { ExternalClientData } from '@/types/external-client-data';
import { REGISTROS_POR_PAGINA, juntarLosRegistros } from '@/lib/pantalla-de-mis-datos';

interface Props {
  userId: string;
  /** Se llama cuando se crea, se edita o se borra un registro. */
  onDataChanged?: () => void;
}

export function MyDataManagement({ userId, onDataChanged }: Props) {
  const [records, setRecords] = useState<ExternalClientData[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ExternalClientData | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ExternalClientData | null>(null);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listExternalClientData(userId, 1, REGISTROS_POR_PAGINA);
      setRecords(result.items);
      setTotal(result.total);
      setPagina(1);
    } catch (error) {
      console.error('[mis-datos] no se pudieron leer los datos importados', error);
      setRecords([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // La página siguiente, junto a lo que ya se ve. Sin esto la lista se
  // quedaba en los 200 más recientes con el total de todos en el pie.
  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    try {
      const siguiente = pagina + 1;
      const result = await listExternalClientData(userId, siguiente, REGISTROS_POR_PAGINA);
      setRecords((previos) => juntarLosRegistros(previos, result.items));
      setTotal(result.total);
      setPagina(siguiente);
    } catch (error) {
      console.error('[mis-datos] no se pudo cargar la página siguiente', error);
    } finally {
      setCargandoMas(false);
    }
  }, [userId, pagina]);

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
    onDataChanged?.();
  }, [loadRecords, onDataChanged]);

  const handleDeleteSuccess = useCallback(() => {
    setDeleteRecord(null);
    loadRecords();
    onDataChanged?.();
  }, [loadRecords, onDataChanged]);

  const columns = useMemo(
    () => buildExternalClientDataColumns({ onEdit: handleEdit, onDelete: handleDelete }),
    [handleEdit, handleDelete],
  );

  return (
    <div data-gestionar="sheets" className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Datos importados</CardTitle>
            </div>
            {/* «+ Nuevo registro» vivía aquí arriba, en una segunda fila
                encima de la barra de la tabla — que ya tiene su hueco de
                crear. Se queda en la barra, que es donde manda la regla. */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={loadRecords}
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
            Revisa y edita los datos que el agente IA usa en tus conversaciones.
            {total > 0 && (
              <span className="ml-1 font-medium text-foreground">{total} registro(s).</span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading && records.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando registros...
            </div>
          ) : (
            // La barra sale SIEMPRE, también sin datos: con la tabla escondida
            // no había forma de crear el primer registro a mano, y en la base
            // de conocimiento sí.
            <ExternalClientDataTable
              columns={columns}
              data={records}
              total={total}
              onCreateNew={handleCreateNew}
              userId={userId}
              onBorrado={() => { void loadRecords(); onDataChanged?.(); }}
              onCargarMas={cargarMas}
              cargandoMas={cargandoMas}
              vacio={
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Database className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No tienes datos importados.</p>
                  <p className="text-xs">Usa la pestaña <strong>Importar</strong> para cargarlos desde Google Sheets, o crea uno con <strong>Nuevo</strong>.</p>
                </div>
              }
            />
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
