'use client';

import { Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * El lápiz y la papelera de una fila, a la vista y no dentro de un menú.
 *
 * Los usan las DOS listas de Mis datos —la tabla de los datos importados y la
 * lista de bloques de la base de conocimiento— con el mismo componente: la
 * tabla los escondía detrás de un «⋯» y la lista los enseñaba sueltos, así que
 * la misma acción se hacía de dos maneras según la pestaña. Y la tabla del
 * administrador (`/admin/external-data`) pinta las mismas columnas.
 */
export function EditarYEliminar({ onEditar, onEliminar }: { onEditar: () => void; onEliminar: () => void }) {
    return (
        <div data-editar-y-eliminar className="flex items-center justify-end gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditar} title="Editar" aria-label="Editar">
                <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onEliminar}
                title="Eliminar"
                aria-label="Eliminar"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
