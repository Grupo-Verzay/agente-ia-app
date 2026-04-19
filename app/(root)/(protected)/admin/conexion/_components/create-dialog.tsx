'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  openCreateDialog: boolean
  setOpenCreateDialog: (open: boolean) => void
  handleCreate: (formData: FormData) => void
}

export const CreateDialog = ({
  openCreateDialog,
  setOpenCreateDialog,
  handleCreate,
}: Props) => {
  return (
    <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear API key</DialogTitle>
          <DialogDescription>
            Ingresa los datos para generar una nueva API Key.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            handleCreate(formData)
          }}
        >
          <div className="overflow-auto max-h-96 pr-2">
            <div className="grid gap-4 py-4">
              {[
                { id: "url", label: "URL", defaultValue: "" },
                { id: "key", label: "KEY", defaultValue: "" },
              ].map(({ id, label, defaultValue }) => (
                <div className="grid grid-cols-4 items-center gap-4" key={id}>
                  <Label htmlFor={id} className="text-right">
                    {label}
                  </Label>
                  <Input
                    id={id}
                    name={id}
                    defaultValue={defaultValue}
                    required
                    className="col-span-3"
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
