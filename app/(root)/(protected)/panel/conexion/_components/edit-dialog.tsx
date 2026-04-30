
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiKey, User } from "@prisma/client";

interface Props {
  openEditDialog: boolean
  setOpenEditDialog: (open: boolean) => void
  handleEdit: (userId: string, formData: FormData) => void
  apikey: ApiKey,
}

export const EditDialog = ({
  openEditDialog,
  setOpenEditDialog,
  handleEdit,
  apikey
}: Props) => {
  return (
    <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
      <DialogContent >
        <DialogHeader>
          <DialogTitle>Editar conexión</DialogTitle>
          <DialogDescription>
            {"Realiza cambios de la conexión aquí. Guarda los cambios cuando termines."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            handleEdit(apikey.id, formData)
          }}
        >
          <div className="overflow-auto max-h-96 pr-2">
            <div className="grid gap-4 py-4">
              {[
                { id: "url", label: "URL", defaultValue: apikey.url },
                { id: "key", label: "KEY", defaultValue: apikey.key },
              ].map(({ id, label, defaultValue }) => (
                <div className="grid grid-cols-4 items-center gap-4" key={id}>
                  <Label htmlFor={id} className="text-right">
                    {label}
                  </Label>
                  <Input
                    id={id}
                    name={id}
                    defaultValue={defaultValue ?? ""}
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
