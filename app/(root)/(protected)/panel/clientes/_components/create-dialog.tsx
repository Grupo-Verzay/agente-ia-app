"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox";
import { PLAN_LABELS, PLANS } from "@/types/plans";
import { ApiKey, Role } from "@prisma/client";
import { userSchema, UserFormValues } from "@/schema/user";
import { Country } from "@/components/custom/CountryCodeSelect";
import { toast } from "sonner";

const ROLES = Object.values(Role);
const ROLE_LABELS: Record<Role, string> = {
  user: "Usuario",
  affiliate: "Afiliado",
  reseller: "Reseller",
  admin: "Administrador",
  super_admin: "Super administrador",
};

interface Props {
  openCreateDialog: boolean;
  setOpenCreateDialog: (open: boolean) => void;
  handleCreate: (formData: UserFormValues) => void;
  apikeys: ApiKey[];
  countries: Country[];
  currentUserRol?: string;
}

export const CreateDialog = ({
  openCreateDialog,
  setOpenCreateDialog,
  handleCreate,
  apikeys,
  currentUserRol,
}: Props) => {
  const isReseller = currentUserRol === 'reseller';

  // Planes que incluyen Sintetizador, Clasificación y Follow ups
  const PLAN_SUPPORTS_CRM: Record<string, boolean> = {
    lite: false,
    basico: false,
    intermedio: true,
    avanzado: true,
    enterprise: true,
    personalizado: true,
  };

  const [status, setStatus] = useState(true);
  const [enabledSynthesizer, setEnabledSynthesizer] = useState(false);
  const [enabledLeadStatusClassifier, setEnabledLeadStatusClassifier] = useState(false);
  const [enabledCrmFollowUps, setEnabledCrmFollowUps] = useState(false);
  const [tz, setTz] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      company: "",
      timezone: "",
      notificationNumber: "",
      role: "user",
      plan: "basico",
      apiKeyId: "",
      delSeguimiento: "",
      webhookUrl: "",
      apiUrl: "",
    },
  });

  const selectedPlan = watch('plan');
  const crmDisabled = isReseller && !PLAN_SUPPORTS_CRM[selectedPlan];

  const handleClose = (open: boolean) => {
    setOpenCreateDialog(open);
    if (!open) {
      reset();
      setStatus(true);
      setEnabledSynthesizer(false);
      setEnabledLeadStatusClassifier(false);
      setEnabledCrmFollowUps(false);
      setTz("");
    }
  };

  const onError = () => {
    toast.error("Revisa los campos obligatorios");
  };

  const onSubmit = (data: UserFormValues) => {
    handleCreate({
      ...data,
      status,
      enabledSynthesizer: crmDisabled ? false : enabledSynthesizer,
      enabledLeadStatusClassifier: crmDisabled ? false : enabledLeadStatusClassifier,
      enabledCrmFollowUps: crmDisabled ? false : enabledCrmFollowUps,
    });
  };

  const switches = [
    { id: "status", label: "Estado", checked: status, onChange: setStatus, disabled: false },
    { id: "enabledSynthesizer", label: "Sintetizador", checked: crmDisabled ? false : enabledSynthesizer, onChange: setEnabledSynthesizer, disabled: crmDisabled },
    { id: "enabledLeadStatusClassifier", label: "Clasificacion", checked: crmDisabled ? false : enabledLeadStatusClassifier, onChange: setEnabledLeadStatusClassifier, disabled: crmDisabled },
    { id: "enabledCrmFollowUps", label: "Follow ups", checked: crmDisabled ? false : enabledCrmFollowUps, onChange: setEnabledCrmFollowUps, disabled: crmDisabled },
  ];

  return (
    <Dialog open={openCreateDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onError)}>
          <div className="overflow-auto max-h-[28rem] pr-2">
            <div className="grid gap-4 py-4">

              {/* Switches */}
              <div className="grid grid-cols-2 gap-2">
                {switches.map(({ id, label, checked, onChange, disabled }) => (
                  <div key={id} className="flex items-center justify-between gap-2 pr-4">
                    <Label htmlFor={id} className={`text-xs font-semibold ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</Label>
                    <Switch id={id} checked={checked} onCheckedChange={disabled ? undefined : onChange} disabled={disabled} />
                  </div>
                ))}
              </div>

              {/* Nombre / Empresa */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-foreground">Nombre</Label>
                  <Input id="name" {...register("name")} placeholder="Juan Pérez" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="company" className="text-xs font-semibold text-foreground">Empresa</Label>
                  <Input id="company" {...register("company")} placeholder="Nombre de empresa" />
                  {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
                </div>
              </div>

              {/* Correo / Contraseña */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground">Correo</Label>
                  <Input id="email" {...register("email")} placeholder="usuario@correo.com" />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="password" className="text-xs font-semibold text-foreground">Contraseña</Label>
                  <Input id="password" type="password" {...register("password")} />
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>
              </div>

              {/* Rol / Plan */}
              <div className="grid grid-cols-2 gap-2">
                {!isReseller && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-semibold text-foreground">Rol</Label>
                    <Select onValueChange={(v) => setValue("role", v as Role)} defaultValue="user">
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
                  </div>
                )}
                <div className={`flex flex-col gap-1 ${isReseller ? 'col-span-2' : ''}`}>
                  <Label className="text-xs font-semibold text-foreground">Plan</Label>
                  <Select onValueChange={(v) => setValue("plan", v as UserFormValues["plan"])} defaultValue="basico">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PLANS.map((plan) => (
                          <SelectItem key={plan} value={plan}>{PLAN_LABELS[plan]}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {errors.plan && <p className="text-xs text-destructive">{errors.plan.message}</p>}
                </div>
              </div>

              {/* Teléfono */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="notificationNumber" className="text-xs font-semibold text-foreground">Teléfono</Label>
                <Input id="notificationNumber" {...register("notificationNumber")} placeholder="573005214574" />
                {errors.notificationNumber && <p className="text-xs text-destructive">{errors.notificationNumber.message}</p>}
              </div>

              {/* Frase de seguimiento */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="delSeguimiento" className="text-xs font-semibold text-foreground">Frase de seguimiento</Label>
                <Input id="delSeguimiento" {...register("delSeguimiento")} placeholder="Ej. Estamos para servirle." />
                {errors.delSeguimiento && <p className="text-xs text-destructive">{errors.delSeguimiento.message}</p>}
              </div>

              {/* Webhook / Evo Api / Api Key IA — solo admins */}
              {!isReseller && (
                <>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="webhookUrl" className="text-xs font-semibold text-foreground">Webhook</Label>
                    <Input id="webhookUrl" {...register("webhookUrl")} placeholder="http://tu-ip:puerto/webhook" />
                    {errors.webhookUrl && <p className="text-xs text-destructive">{errors.webhookUrl.message}</p>}
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-semibold text-foreground">Evo Api</Label>
                    <Select onValueChange={(v) => setValue("apiKeyId", v)} defaultValue="">
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una API Key" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {apikeys.map(({ id, url }) => (
                            <SelectItem key={id} value={id}>{url}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {errors.apiKeyId && <p className="text-xs text-destructive">{errors.apiKeyId.message}</p>}
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="apiUrl" className="text-xs font-semibold text-foreground">Api Key IA</Label>
                    <Input id="apiUrl" {...register("apiUrl")} placeholder="https://api.openai.com/v1" />
                    {errors.apiUrl && <p className="text-xs text-destructive">{errors.apiUrl.message}</p>}
                  </div>
                </>
              )}

              {/* Zona horaria */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-foreground">Zona horaria</Label>
                <TimezoneCombobox value={tz} onChange={(v) => { setTz(v); setValue("timezone", v); }} />
                {errors.timezone && <p className="text-xs text-destructive">{errors.timezone.message}</p>}
              </div>

            </div>
          </div>

          <div className="pt-4 flex flex-row justify-between">
            <Button variant="outline" type="button" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button variant="save" type="submit">Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
