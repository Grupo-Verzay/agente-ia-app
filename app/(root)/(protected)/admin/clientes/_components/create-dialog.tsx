'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApiKey } from '@prisma/client'
import { FormUser } from './FormUser';
import { userSchema } from '@/schema/user'
import { z } from 'zod'
import { Country } from '@/components/custom/CountryCodeSelect';
import { ScrollArea } from '@/components/ui/scroll-area';

type UserFormValues = z.infer<typeof userSchema>;
interface Props {
  openCreateDialog: boolean
  setOpenCreateDialog: (open: boolean) => void
  handleCreate: (formData: UserFormValues) => void
  apikeys: ApiKey[],
  countries: Country[]
}

export const CreateDialog = ({
  openCreateDialog,
  setOpenCreateDialog,
  handleCreate,
  apikeys,
  countries
}: Props) => {

  return (
    <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
          <DialogDescription>
            Rellena los campos para crear un nuevo perfil.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <FormUser onSubmit={handleCreate} apikeys={apikeys} countries={countries} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
