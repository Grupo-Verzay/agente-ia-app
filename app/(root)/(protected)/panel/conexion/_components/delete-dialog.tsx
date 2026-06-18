'use client'

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApiKey } from '@prisma/client'

interface Props {
  apikey: ApiKey,
  openDeleteDialog: boolean
  setOpenDeleteDialog: (open: boolean) => void
  handleDelete: (apikey: string) => void
}

export const DeleteDialog = ({
  apikey,
  openDeleteDialog,
  setOpenDeleteDialog,
  handleDelete,
}: Props) => {

  return (
    <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar APIKEY?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p>¿Estás seguro? se perderá para siempre.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleDelete(apikey.id);
                setOpenDeleteDialog(false)
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}