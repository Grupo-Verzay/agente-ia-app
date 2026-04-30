'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ClientInterface } from '@/lib/types'

interface Props {
  user: ClientInterface,
  openDeleteDialog: boolean
  setOpenDeleteDialog: (open: boolean) => void
  handleDelete: (userId: string) => void
}

export const DeleteDialog = ({
  user,
  openDeleteDialog,
  setOpenDeleteDialog,
  handleDelete,
}: Props) => {

  return (
    <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar cliente?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p>¿Estás seguro de eliminar a <strong>{user?.name || ''}</strong>?</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleDelete(user?.id || '');
                setOpenDeleteDialog(false)
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}