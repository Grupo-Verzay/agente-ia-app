"use client";

import React, { useState, useTransition } from "react";
import { z } from "zod";
import { object, string } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import Link from "next/link";

import { fullRegisterAction } from "@/actions/register-full-action";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Target,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const freeRegisterSchema = object({
  name: string({ required_error: "El nombre es requerido" })
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(64, "El nombre no puede superar 64 caracteres."),
  email: string({ required_error: "El correo es requerido" })
    .min(1, "El correo es requerido")
    .email("Ingresa un correo electrónico válido."),
  password: string({ required_error: "La contraseña es requerida" })
    .min(6, "La contraseña debe tener al menos 6 caracteres.")
    .max(32, "La contraseña no puede superar 32 caracteres."),
  company: string({ required_error: "El nombre de tu empresa es requerido" })
    .min(2, "El nombre de la empresa debe tener al menos 2 caracteres.")
    .max(80, "El nombre de la empresa no puede superar 80 caracteres."),
  salesObjective: string({ required_error: "Selecciona un objetivo de ventas" })
    .min(1, "Selecciona un objetivo de ventas."),
});

type FreeFormValues = z.infer<typeof freeRegisterSchema>;

const STEPS = [
  { id: 1, label: "Tus datos" },
  { id: 2, label: "Tu negocio" },
] as const;

const SALES_OBJECTIVES = [
  { value: "venta-directa", label: "⚡ Venta directa" },
  { value: "venta-consultiva", label: "🎯 Venta consultiva" },
  { value: "agendamiento-citas", label: "📅 Agendar citas" },
  { value: "calificacion-leads", label: "🧲 Calificar leads" },
  { value: "atencion-cliente", label: "🎧 Atención al cliente" },
  { value: "pedidos-delivery", label: "🛵 Pedidos / Delivery" },
] as const;

interface Props {
  resellerSlug?: string;
  defaultSalesObjective?: string;
  apiKeyRef?: string;
  affiliateCode?: string;
}

/* ── Step indicator ── */
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {STEPS.map((step, idx) => {
        const isCompleted = step.id < current;
        const isActive = step.id === current;
        return (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                  isCompleted && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !isCompleted && !isActive && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : step.id}
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-12 transition-colors duration-300",
                  isCompleted ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Password field ── */
function PasswordField({ field }: { field: React.ComponentProps<typeof Input> }) {
  const [show, setShow] = useState(false);
  return (
    <FormItem>
      <FormLabel className="font-semibold">Contraseña</FormLabel>
      <FormControl>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            {...field}
            type={show ? "text" : "password"}
            placeholder="Mínimo 6 caracteres"
            className="pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

/* ── Step 1: datos personales ── */
function Step1Fields({ form }: { form: ReturnType<typeof useForm<FreeFormValues>> }) {
  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Nombre completo</FormLabel>
            <FormControl>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input {...field} placeholder="Juan Pérez" className="pl-9" autoFocus autoComplete="name" />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Correo electrónico</FormLabel>
            <FormControl>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input {...field} type="email" placeholder="tu@empresa.com" className="pl-9" autoComplete="email" />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <PasswordField field={field as React.ComponentProps<typeof Input>} />
        )}
      />
    </div>
  );
}

/* ── Step 2: datos del negocio ── */
function Step2Fields({
  form,
  defaultSalesObjective,
}: {
  form: ReturnType<typeof useForm<FreeFormValues>>;
  defaultSalesObjective?: string;
}) {
  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="company"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Nombre de tu empresa o negocio</FormLabel>
            <FormControl>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input {...field} placeholder="Mi Empresa S.A.S" className="pl-9" autoFocus />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="salesObjective"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Objetivo principal de ventas</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <Target className="w-4 h-4 text-muted-foreground mr-2" />
                  <SelectValue placeholder="Selecciona un objetivo..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SALES_OBJECTIVES.map((obj) => (
                  <SelectItem key={obj.value} value={obj.value}>
                    {obj.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────── */
export default function FormRegisterFree({
  resellerSlug,
  defaultSalesObjective,
  apiKeyRef,
  affiliateCode,
}: Props) {
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [successData, setSuccessData] = useState<{ email: string; whatsappUrl?: string } | null>(null);

  const form = useForm<FreeFormValues>({
    resolver: zodResolver(freeRegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      company: "",
      salesObjective: defaultSalesObjective ?? "",
    },
    mode: "onTouched",
  });

  const handleNext = async () => {
    const valid = await form.trigger(["name", "email", "password"]);
    if (valid) setStep(2);
  };

  const onSubmit = (values: FreeFormValues) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    startTransition(async () => {
      const toastId = toast.loading("Creando tu cuenta...");

      const result = await fullRegisterAction(
        {
          ...values,
          notificationNumber: "",
          timezone,
          businessSector: "",
          mainProduct: "",
        },
        apiKeyRef,
        affiliateCode,
        resellerSlug,
        false
      );

      if (!result.success) {
        toast.error(result.error, { id: toastId });
        return;
      }

      toast.dismiss(toastId);
      setSuccessData({ email: values.email, whatsappUrl: result.whatsappUrl });
    });
  };

  if (successData) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4 pt-4 pb-0 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">¡Tu cuenta está lista!</h1>
          <p className="text-muted-foreground mt-2 text-sm">Tu agente IA fue configurado y está listo para activarse.</p>
        </div>

        <div className="w-full rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-sm"><span className="text-muted-foreground">Tu correo de acceso: </span><span className="font-medium">{successData.email}</span></p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <a
            href="/profile?autoSetup=1"
            className="w-full flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-3 text-sm font-semibold transition"
          >
            Conectar mi WhatsApp
          </a>
          {successData.whatsappUrl && (
            <a
              href={successData.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center rounded-lg border hover:bg-muted px-4 py-3 text-sm font-medium text-muted-foreground transition"
            >
              Quiero ayuda → Soporte por WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta gratis</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          7 días de prueba · Sin tarjeta de crédito
        </p>
      </div>

      <StepIndicator current={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className={cn(step === 1 ? "block" : "hidden")}>
            <Step1Fields form={form} />
          </div>
          <div className={cn(step === 2 ? "block" : "hidden")}>
            <Step2Fields form={form} defaultSalesObjective={defaultSalesObjective} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={isPending}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Atrás
              </Button>
            )}

            {step === 1 ? (
              <Button type="button" className="w-full" onClick={handleNext}>
                Continuar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  "Crear cuenta gratis"
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
