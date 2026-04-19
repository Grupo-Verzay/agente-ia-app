'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, FileTextIcon, Trash2, AlarmClock } from 'lucide-react';

interface NodeActionsProps {
  onDeleteFile: () => void
  onDeleteNode: () => void
  fileType: string
}

export function NodeActions({
  onDeleteFile,
  onDeleteNode,
  fileType,
}: NodeActionsProps) {
  const [openConfirmDeleteNode, setOpenConfirmDeleteNode] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4 m-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">

          {fileType !== 'text' &&
            <DropdownMenuItem onClick={onDeleteFile}>
              <FileTextIcon />
              Eliminar archivo
            </DropdownMenuItem>
          }

          <DropdownMenuItem onClick={() => setOpenConfirmDeleteNode(true)} className="text-red-600">
            <Trash2 />
            Eliminar nodo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>


      <AlertDialog open={openConfirmDeleteNode} onOpenChange={setOpenConfirmDeleteNode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              ¿Eliminar nodo permanentemente?
            </AlertDialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Esta acción <span className="font-semibold text-destructive">no se puede deshacer</span>.
              El nodo y sus datos relacionados serán eliminados de forma permanente.
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteNode}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Eliminar nodo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}