"use client";

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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
import { PLAN_LABELS, PLANS } from "@/types/plans"
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox"
import { useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { ApiKeyConfigurator } from "@/app/(root)/profile/_components/ApiKeyConfigurator"
import { getIaCreditByUser } from "@/actions/actions-ia-credits"
import { onTokensToCredits } from "@/utils/onTokensToCredits"
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
  currentUserRol,
}: Props) => {
  const ROLES = Object.values(Role);
  const ROLE_LABELS: Record<Role, string> = {
    user: 'Usuario',
    affiliate: 'Afiliado',
    reseller: 'Reseller',
    admin: 'Administrador',
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
  const [enMute, setEnMute] = useState<boolean>(user.muteAgentResponses ?? false);
  const [enFacebook, setEnFacebook] = useState<boolean>(user.onFacebook ?? false);
  const [enInstagram, setEnInstagram] = useState<boolean>(user.onInstagram ?? false);
  const [creditTotal, setCreditTotal] = useState(0);
  const [creditUsed, setCreditUsed] = useState(0);
  const [creditHasRecord, setCreditHasRecord] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);

  useEffect(() => {
    if (!openEditDialog || currentUserRol === 'reseller') return;
    setCreditLoading(true);
    getIaCreditByUser(user.id).then(res => {
      if (res.success && res.data?.length) {
        setCreditTotal(res.data[0].total);
        setCreditUsed(onTokensToCredits(res.data[0].used));
        setCreditHasRecord(true);
      } else {
        setCreditTotal(0);
        setCreditUsed(0);
        setCreditHasRecord(false);
      }
      setCreditLoading(false);
    });
  }, [user.id, openEditDialog, currentUserRol]);

  useEffect(() => {
    setTz(user.timezone ?? "");
    setEnSi(user.enabledSynthesizer ?? false);
    setEnLeadStatus(user.enabledLeadStatusClassifier ?? false);
    setEnCrmFollowUps(user.enabledCrmFollowUps ?? false);
    setUserStatus(user.status ?? false);
    setEnMute(user.muteAgentResponses ?? false);
    setEnFacebook(user.onFacebook ?? false);
    setEnInstagram(user.onInstagram ?? false);
  }, [
    user.id,
    openEditDialog,
    user.timezone,
    user.enabledSynthesizer,
    user.enabledLeadStatusClassifier,
    user.enabledCrmFollowUps,
    user.status,
    user.muteAgentResponses,
    user.onFacebook,
    user.onInstagram,
  ]);

  let fields = [
    // Switches
    { id: "status",                    label: "Estado",        defaultValue: user.status ?? false,                    readOnly: false },
    { id: "enabledSynthesizer",        label: "Sintetizador",  defaultValue: user.enabledSynthesizer ?? false,        readOnly: false },
    { id: "enabledLeadStatusClassifier", label: "Clasificacion", defaultValue: user.enabledLeadStatusClassifier ?? false, readOnly: false },
    { id: "enabledCrmFollowUps",       label: "Follow ups",    defaultValue: user.enabledCrmFollowUps ?? false,       readOnly: false },
    { id: "onFacebook",  label: "Facebook",   defaultValue: user.onFacebook ?? false,   readOnly: false },
    { id: "onInstagram", label: "Instagram",  defaultValue: user.onInstagram ?? false,  readOnly: false },
    // Campos regulares — en el orden pedido
    { id: "name",        label: "Nombre",       defaultValue: user.name,          readOnly: false },
    { id: "company",     label: "Empresa",      defaultValue: user.company,       readOnly: false },
    { id: "email",       label: "Correo",       defaultValue: user.email,         readOnly: false },
    { id: "passPlainTxt",label: "Contraseña",   defaultValue: user.passPlainTxt,  readOnly: false },
    { id: "role",        label: "Rol",          defaultValue: user.role,          readOnly: false },
    { id: "plan",        label: "Plan",         defaultValue: user.plan,          readOnly: false },
    { id: "creditTotal", label: "Créditos +",   defaultValue: null,               readOnly: false },
    { id: "creditUsed",  label: "Créditos -",   defaultValue: null,               readOnly: false },
    { id: "webhookUrl",  label: "Webhook",      defaultValue: user.webhookUrl,    readOnly: false },
    { id: "apiKeyId",    label: "Evo Api",      defaultValue: user.apiKeyId,      readOnly: false },
    { id: "apiKeyIa",    label: "Api Key IA",   defaultValue: null,               readOnly: false },
    { id: "timezone",    label: "Zona horaria", defaultValue: user.timezone,      readOnly: false },
  ];

  /* Ocultar/mostrar fields para reseller */
  if (currentUserRol === 'reseller') {
    const idsToRemove = ["apiKeyId", "webhookUrl", "creditTotal", "creditUsed", "apiKeyIa"]
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
    readOnly?: boolean,
    label?: string
  ) => {
    switch (id) {
      case 'apiKeyId':
        return (
          <Select name={id} defaultValue={defaultValue?.toString() ?? ""} disabled={readOnly}>
            <SelectTrigger>
              <SelectValue placeholder={label ?? "Selecciona una API Key"} />
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
            <SelectTrigger>
              <SelectValue placeholder={label ?? "Selecciona un rol"} />
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
            <SelectTrigger>
              <SelectValue placeholder={label ?? "Selecciona un plan"} />
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
      case 'muteAgentResponses': {
        const checked = enMute;
        return (
          <div className="col-span-3 flex items-center gap-3">
            <input type="hidden" name="muteAgentResponses" value={checked ? "true" : "false"} />
            <Switch
              id="muteAgentResponses"
              checked={checked}
              onCheckedChange={(state: boolean) => { setEnMute(state) }}
              disabled={readOnly}
            />
          </div>
        )
      }
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
              placeholder={label}
              readOnly
              disabled
            />
          );
        }
        return (
          <div>
            <TimezoneCombobox value={tz} onChange={setTz} />
            <input type="hidden" name="timezone" value={tz} />
          </div>
        );

      case 'creditTotal':
        if (creditLoading) return <span className="text-sm text-muted-foreground">Cargando...</span>;
        return (
          <Input id="creditTotal" name="creditTotal" type="number" value={creditTotal}
            onChange={(e) => setCreditTotal(parseInt(e.target.value) || 0)} placeholder={label} />
        );
      case 'creditUsed':
        if (creditLoading) return <span className="text-sm text-muted-foreground">Cargando...</span>;
        return (
          <Input id="creditUsed" name="creditUsed" type="number" value={creditUsed}
            onChange={(e) => setCreditUsed(parseInt(e.target.value) || 0)} placeholder={label} />
        );
      case 'apiKeyIa':
        return (
          <div>
            <ApiKeyConfigurator userId={user.id} label="" />
          </div>
        );

      default:
        return (
          <Input
            id={id}
            name={id}
            defaultValue={defaultValue?.toString() ?? ""}
            placeholder={label}
            readOnly={readOnly}
            disabled={readOnly}
          />
        )
    }
  }

  const switchFieldIds = ['status', 'muteAgentResponses', 'enabledSynthesizer', 'enabledLeadStatusClassifier', 'enabledCrmFollowUps', 'onFacebook', 'onInstagram'];

  const getSwitchState = (id: string) => {
    const map: Record<string, { checked: boolean; onChange: (v: boolean) => void }> = {
      status: { checked: userStatus, onChange: setUserStatus },
      muteAgentResponses: { checked: enMute, onChange: setEnMute },
      enabledSynthesizer: { checked: enSi, onChange: setEnSi },
      enabledLeadStatusClassifier: { checked: enLeadStatus, onChange: setEnLeadStatus },
      enabledCrmFollowUps: { checked: enCrmFollowUps, onChange: setEnCrmFollowUps },
      onFacebook: { checked: enFacebook, onChange: setEnFacebook },
      onInstagram: { checked: enInstagram, onChange: setEnInstagram },
    };
    return map[id] ?? { checked: false, onChange: () => {} };
  };

  const switchFields = fields.filter(f => switchFieldIds.includes(f.id));
  const regularFields = fields.filter(f => !switchFieldIds.includes(f.id));

  const showAiConfig = currentUserRol !== 'reseller';

  return (
    <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>


        <form action={(formData) => handleEdit(user.id, formData)}>
          <div className="overflow-auto max-h-[28rem] pr-2">
            <div className="grid gap-4 py-4">
              {/* Switches en grid 2 columnas */}
              <div className="grid grid-cols-2 gap-2">
                {switchFields.map(({ id, label, readOnly }) => {
                  const { checked, onChange } = getSwitchState(id);
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 pr-4">
                      <Label htmlFor={id} className="text-xs font-semibold text-foreground">{label}</Label>
                      <input type="hidden" name={id} value={checked ? "true" : "false"} />
                      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={readOnly} />
                    </div>
                  );
                })}
              </div>

              {/* Campos regulares */}
              <input type="hidden" name="creditHasRecord" value={creditHasRecord ? "true" : "false"} />
              {(() => {
                const pairs: Record<string, string> = {
                  name: 'company',
                  email: 'passPlainTxt',
                  role: 'plan',
                  creditTotal: 'creditUsed',
                };
                const secondOfPair = new Set(Object.values(pairs));
                return regularFields.map(({ id, label, defaultValue, readOnly }) => {
                  if (secondOfPair.has(id)) return null;
                  if (id in pairs) {
                    const pairedId = pairs[id];
                    const pairedField = regularFields.find(f => f.id === pairedId);
                    return (
                      <div key={id} className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={id} className="text-xs font-semibold text-foreground">{label}</Label>
                          {handleRenderField(id, defaultValue, readOnly, label)}
                        </div>
                        {pairedField && (
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={pairedId} className="text-xs font-semibold text-foreground">{pairedField.label}</Label>
                            {handleRenderField(pairedId, pairedField.defaultValue, pairedField.readOnly, pairedField.label)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={id} className="flex flex-col gap-1">
                      <Label htmlFor={id} className="text-xs font-semibold text-foreground">{label}</Label>
                      {handleRenderField(id, defaultValue, readOnly, label)}
                    </div>
                  );
                });
              })()}

            </div>
          </div>

          <DialogFooter className="pt-4 flex-row justify-between sm:justify-between">
            <Button variant="outline" type="button" onClick={() => setOpenEditDialog(false)}>Cancelar</Button>
            <Button variant="save" type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
