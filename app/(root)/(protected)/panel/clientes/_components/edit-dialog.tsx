"use client";

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ClientInterface } from "@/lib/types"
import { ApiKey, Role } from "@prisma/client"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { VolumeX, Volume2, BrainCircuit } from 'lucide-react'
import { PLAN_LABELS, PLANS } from "@/types/plans"
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox"
import { useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { ApiKeyConfigurator } from "@/app/(root)/profile/_components/ApiKeyConfigurator"

interface Props {
  openEditDialog: boolean
  setOpenEditDialog: (open: boolean) => void
  handleEdit: (userId: string, formData: FormData) => void
  user: ClientInterface
  apikeys: ApiKey[]
  currentUserRol: string
}

export const EditDialog = ({
  openEditDialog,
  setOpenEditDialog,
  handleEdit,
  user,
  apikeys,
  currentUserRol
}: Props) => {
  const ROLES = Object.values(Role);
  const ROLE_LABELS: Record<Role, string> = {
    user: 'Usuario',
    admin: 'Administrador',
    reseller: 'Reseller',
    super_admin: 'Super administrador',
  };

  const [tz, setTz] = useState<string>(user.timezone ?? "");
  const [enSi, setEnSi] = useState<boolean>(user.enabledSynthesizer ?? false);
  const [enLeadStatus, setEnLeadStatus] = useState<boolean>(
    user.enabledLeadStatusClassifier ?? false
  );
  const [enCrmFollowUps, setEnCrmFollowUps] = useState<boolean>(
    user.enabledCrmFollowUps ?? false
  );
  const [userStatus, setUserStatus] = useState<boolean>(user.status ?? false);

  useEffect(() => {
    setTz(user.timezone ?? "");
    setEnSi(user.enabledSynthesizer ?? false);
    setEnLeadStatus(user.enabledLeadStatusClassifier ?? false);
    setEnCrmFollowUps(user.enabledCrmFollowUps ?? false);
    setUserStatus(user.status ?? false);
  }, [
    user.id,
    openEditDialog,
    user.timezone,
    user.enabledSynthesizer,
    user.enabledLeadStatusClassifier,
    user.enabledCrmFollowUps,
    user.status,
  ]);

  let fields = [
    {
      id: "status",
      label: "Estado",
      defaultValue: user.status ?? false,
      readOnly: false,
    },
    {
      id: "muteAgentResponses",
      label: "Silenciar agente",
      defaultValue: user.muteAgentResponses,
      readOnly: false,
    },
    {
      id: "enabledSynthesizer",
      label: "Activar sintetizador",
      defaultValue: user.enabledSynthesizer ?? false,
      readOnly: false,
    },
    {
      id: "enabledLeadStatusClassifier",
      label: "Clasificar lead por estado",
      defaultValue: user.enabledLeadStatusClassifier ?? false,
      readOnly: false,
    },
    {
      id: "enabledCrmFollowUps",
      label: "Follow-ups inteligentes",
      defaultValue: user.enabledCrmFollowUps ?? false,
      readOnly: false,
    },

    { id: "name", label: "Nombre", defaultValue: user.name, readOnly: false },
    { id: "email", label: "Email", defaultValue: user.email, readOnly: false },
    { id: "passPlainTxt", label: "Contraseña", defaultValue: user.passPlainTxt, readOnly: true },
    { id: "role", label: "Rol", defaultValue: user.role, readOnly: false },
    { id: "plan", label: "Plan", defaultValue: user.plan, readOnly: false },
    { id: "webhookUrl", label: "Webhook URL", defaultValue: user.webhookUrl, readOnly: false },
    { id: "company", label: "Empresa", defaultValue: user.company, readOnly: false },
    // { id: "notificationNumber", label: "Teléfono Notificación", defaultValue: user.notificationNumber, readOnly: false },
    { id: "timezone", label: "Zona horaria", defaultValue: user.timezone, readOnly: false },
    // { id: "openMsg", label: "Frase de reactivación", defaultValue: openMsg, readOnly: false },
    // { id: "mapsUrl", label: "Maps URL", defaultValue: user.mapsUrl, readOnly: false },
    // { id: "lat", label: "Latitud", defaultValue: user.lat, readOnly: false },
    // { id: "lng", label: "Longitud", defaultValue: user.lng, readOnly: false },
    { id: "apiKeyId", label: "Evo - API Key", defaultValue: user.apiKeyId, readOnly: false },
  ];

  /* Ocultar/mostrar fields para reseller */
  if (currentUserRol === 'reseller') {
    const idsToRemove = ["apiKeyId", "webhookUrl"]
    fields = fields.filter(field => !idsToRemove.includes(field.id))

    const idsReadOnly = ["name", "email", "role", "plan"]
    fields = fields.map(field =>
      idsReadOnly.includes(field.id)
        ? { ...field, readOnly: true }
        : field
    )
  };

  const handleRenderField = (
    id: string,
    defaultValue: string | number | boolean | null | undefined,
    readOnly?: boolean
  ) => {
    switch (id) {
      case 'apiKeyId':
        return (
          <Select name={id} defaultValue={defaultValue?.toString() ?? ""} disabled={readOnly}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Selecciona una API Key" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {apikeys.map(({ id, url }) => (
                  <SelectItem key={id} value={id}>
                    {url}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )

      case 'role':
        return (
          <Select name={id} defaultValue={defaultValue?.toString() ?? ""} disabled={readOnly}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Selecciona un rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ROLES.map(role => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )
      case 'plan':
        return (
          <Select name={id} defaultValue={defaultValue?.toString() ?? ""} disabled={readOnly}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Selecciona un rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PLANS.map(plan => (
                  <SelectItem key={plan} value={plan}>
                    {PLAN_LABELS[plan]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )
      case 'muteAgentResponses':
        return (
          <Select name={id} defaultValue={defaultValue ? 'true' : 'false'} disabled={readOnly}>
            <SelectTrigger className="col-span-3">
              <SelectValue
                placeholder="Silenciar respuestas"
                className="flex gap-2 items-center"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="true">
                  <div className="flex items-center gap-2">
                    <VolumeX className="w-4 h-4 text-destructive" />
                    <span>Activado</span>
                    <Badge variant="destructive" className="ml-auto">Silenciado</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="false">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-green-500 dark:text-green-400" />
                    <span>Desactivado</span>
                    <Badge variant="outline" className="ml-auto text-green-600 border-green-600 dark:text-green-400 dark:border-green-400">
                      Responde
                    </Badge>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )
      case 'enabledSynthesizer': {
        const checked = enSi;
        return (
          <div className="col-span-3 flex items-center gap-3">
            <input type="hidden" name="enabledSynthesizer" value={checked ? "true" : "false"} />
            <Switch
              id="enabledSynthesizer"
              checked={checked}
              onCheckedChange={(state: boolean) => { setEnSi(state) }}
              disabled={readOnly}
            />
          </div>
        )
      }
      case 'enabledLeadStatusClassifier': {
        const checked = enLeadStatus;
        return (
          <div className="col-span-3 flex items-center gap-3">
            <input
              type="hidden"
              name="enabledLeadStatusClassifier"
              value={checked ? "true" : "false"}
            />
            <Switch
              id="enabledLeadStatusClassifier"
              checked={checked}
              onCheckedChange={(state: boolean) => { setEnLeadStatus(state) }}
              disabled={readOnly}
            />
          </div>
        )
      }
      case 'enabledCrmFollowUps': {
        const checked = enCrmFollowUps;
        return (
          <div className="col-span-3 flex items-center gap-3">
            <input
              type="hidden"
              name="enabledCrmFollowUps"
              value={checked ? "true" : "false"}
            />
            <Switch
              id="enabledCrmFollowUps"
              checked={checked}
              onCheckedChange={(state: boolean) => { setEnCrmFollowUps(state) }}
              disabled={readOnly}
            />
          </div>
        )
      }
      case 'status': {
        const checked = userStatus;
        return (
          <div className="col-span-3 flex items-center gap-3">
            <input type="hidden" name="status" value={checked ? "true" : "false"} />
            <Switch
              id="status"
              checked={checked}
              onCheckedChange={(state: boolean) => { setUserStatus(state) }}
              disabled={readOnly}
            />
          </div>
        )
      }
      case 'timezone':
        if (readOnly) {
          return (
            <Input
              id="timezone"
              name="timezone"
              defaultValue={defaultValue?.toString() ?? ""}
              className="col-span-3"
              readOnly
              disabled
            />
          );
        }
        return (
          <div className="col-span-3">
            <TimezoneCombobox value={tz} onChange={setTz} />
            <input type="hidden" name="timezone" value={tz} />
          </div>
        );

      default:
        return (
          <Input
            id={id}
            name={id}
            defaultValue={defaultValue?.toString() ?? ""}
            className="col-span-3"
            readOnly={readOnly}
            disabled={readOnly}
          />
        )
    }
  }

  const showAiConfig = currentUserRol !== 'reseller';

  return (
    <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Realiza cambios del cliente aquí. Guarda los cambios cuando termines.
          </DialogDescription>
        </DialogHeader>

        {/* Sección API Key IA — gestiona su propio guardado */}
        {showAiConfig && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BrainCircuit className="h-4 w-4 text-primary" />
              Configuración IA
            </div>
            <ApiKeyConfigurator userId={user.id} label="" />
          </div>
        )}

        <form action={(formData) => handleEdit(user.id, formData)}>
          <div className="overflow-auto max-h-80 pr-2">
            <div className="grid gap-4 py-4">
              {fields.map(({ id, label, defaultValue, readOnly }) => (
                <div className="grid grid-cols-4 items-center gap-4" key={id}>
                  <Label htmlFor={id} className="text-right">{label}</Label>
                  {handleRenderField(id, defaultValue, readOnly)}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
