"use client";

import React from "react";
import { fullRegisterSchema } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";

import {
  fullRegisterAction,
  type RegisterCompletedStep,
} from "@/actions/register-full-action";
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
import { Label } from "@/components/ui/label";
import { CountryCodeSelect, type Country } from "@/components/custom/CountryCodeSelect";
import { normalizeToE164 } from "@/app/schedule/helpers/normalizeToE164";
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
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Phone,
  User,
  Lock,
  Briefcase,
  Target,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
const paidRegisterSchema = fullRegisterSchema.extend({
  businessSector: z.string().min(2, "El rubro es requerido.").max(100),
  mainProduct: z.string().min(10, "Describe tu negocio y productos (mínimo 10 caracteres).").max(500),
});

type FormValues = z.infer<typeof paidRegisterSchema>;

const STEPS = [
  { id: 1, label: "Tus datos" },
  { id: 2, label: "Tu empresa" },
  { id: 3, label: "Tu agente" },
] as const;

const STEP_MESSAGES: Record<RegisterCompletedStep, string> = {
  user: "Cuenta creada",
  billing: "Plan de prueba configurado",
  credits: "1000 créditos IA asignados",
  tags: "Etiquetas por defecto creadas",
  instance: "Instancia de WhatsApp lista",
};

const SALES_OBJECTIVES = [
  { value: "venta-directa", label: "⚡ Venta directa" },
  { value: "venta-consultiva", label: "🎯 Venta consultiva" },
  { value: "agendamiento-citas", label: "📅 Agendar citas" },
  { value: "calificacion-leads", label: "🧲 Calificar leads" },
  { value: "atencion-cliente", label: "🎧 Atención al cliente" },
  { value: "pedidos-delivery", label: "🛵 Pedidos / Delivery" },
] as const;

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

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
                  isCompleted &&
                    "bg-primary text-primary-foreground",
                  isActive &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !isCompleted && !isActive &&
                    "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  step.id
                )}
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

function PasswordField({
  field,
  label = "Contraseña",
  placeholder = "Mínimo 6 caracteres",
}: {
  field: React.ComponentProps<typeof Input> & { ref?: React.Ref<HTMLInputElement> };
  label?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <FormItem>
      <FormLabel className="font-semibold">{label}</FormLabel>
      <FormControl>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            {...field}
            type={show ? "text" : "password"}
            placeholder={placeholder}
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

/* Step 1: Personal info */
function Step1Fields({ form }: { form: ReturnType<typeof useForm<FormValues>> }) {
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
                <Input
                  {...field}
                  placeholder="Juan Pérez"
                  className="pl-9"
                  autoComplete="name"
                  autoFocus
                />
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
                <Input
                  {...field}
                  type="email"
                  placeholder="tu@empresa.com"
                  className="pl-9"
                  autoComplete="email"
                />
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

/* Step 2: Business info */
function Step2Fields({
  form,
  countries,
  areaCode,
  setAreaCode,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  countries: Country[];
  areaCode: string;
  setAreaCode: (v: string) => void;
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
                <Input
                  {...field}
                  placeholder="Mi Empresa S.A.S"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <Label>País</Label>
        <CountryCodeSelect
          countries={countries}
          defaultValue={areaCode}
          onChange={setAreaCode}
        />
      </div>

      <FormField
        control={form.control}
        name="notificationNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Número de WhatsApp</FormLabel>
            <FormControl>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...field}
                  inputMode="tel"
                  placeholder="Número local"
                  className="pl-9"
                  autoComplete="tel"
                />
              </div>
            </FormControl>
            <p className="text-xs text-muted-foreground mt-1">
              Este número recibirá las notificaciones de tu cuenta.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/* Step 3: Business context for AI agent */
function Step3Fields({ form }: { form: ReturnType<typeof useForm<FormValues>> }) {
  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="businessSector"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Rubro del negocio</FormLabel>
            <FormControl>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  {...field}
                  placeholder="Ej: Moda, Salud, Tecnología, Restaurante..."
                  className="pl-9"
                  autoFocus
                />
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
            <FormLabel className="font-semibold">Objetivo de ventas</FormLabel>
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

      <FormField
        control={form.control}
        name="mainProduct"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="font-semibold">Información de tu negocio, productos/servicios y demás</FormLabel>
            <FormControl>
              <textarea
                {...field}
                rows={4}
                placeholder="Cuéntanos sobre tu negocio: qué vendes, precios, cómo funciona tu proceso de venta, qué te diferencia de la competencia, etc. Mientras más detalle, mejor configurado quedará tu agente."
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </FormControl>
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
const PLAN_DISPLAY: Record<string, string> = {
  lite: "Lite", basico: "Básico", intermedio: "Intermedio",
  avanzado: "Avanzado", enterprise: "Enterprise",
};

const FormRegister = ({ countries, apiKeyRef, affiliateCode, defaultPlan, resellerSlug, defaultSalesObjective }: {
  countries: Country[];
  apiKeyRef?: string;
  affiliateCode?: string;
  defaultPlan?: string;
  resellerSlug?: string;
  defaultSalesObjective?: string;
}) => {
  const [step, setStep] = useState(1);
  const [areaCode, setAreaCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(paidRegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      company: "",
      notificationNumber: "",
      timezone: "",
      businessSector: "",
      salesObjective: defaultSalesObjective ?? "",
      mainProduct: "",
      clienteIdeal: "",
      tono: "",
    },
    mode: "onTouched",
  });

  /* ── Step 1 → Step 2 validation ── */
  const handleNextStep = async () => {
    if (step === 1) {
      const valid = await form.trigger(["name", "email", "password"]);
      if (valid) setStep(2);
    } else if (step === 2) {
      const valid = await form.trigger(["company", "notificationNumber"]);
      if (valid) setStep(3);
    }
  };

  /* ── Final submit ── */
  const onSubmit = (values: FormValues) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const e164 = normalizeToE164(areaCode, values.notificationNumber);
    if (!e164) {
      toast.error("Número de WhatsApp inválido. Verifica el país y el número.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("Iniciando configuración de tu cuenta...");

      const result = await fullRegisterAction({ ...values, notificationNumber: e164, timezone }, apiKeyRef, affiliateCode, resellerSlug, true);

      if (!result.success) {
        toast.error(result.error, { id: toastId });
        return;
      }

      toast.dismiss(toastId);

      const stepLabels = result.completedSteps.map((s) => STEP_MESSAGES[s]);
      stepLabels.forEach((label, i) => {
        setTimeout(() => {
          toast.success(label, { duration: 3000 });
        }, i * 400);
      });

      const welcomeDelay = stepLabels.length * 400 + 200;
      setTimeout(() => {
        toast.success(
          `¡Bienvenido! Tu periodo de prueba gratuito ha iniciado. Vence el ${result.trialEndsLabel}`,
          {
            duration: 8000,
            description: defaultPlan
              ? "Completa tu compra eligiendo el método de pago."
              : result.whatsappUrl
                ? "Te llevamos al chat para ver tu agente en acción."
                : "Ve a tu perfil para escanear el QR y comenzar a usar la app.",
          }
        );

        if (defaultPlan) {
          router.push(`/planes?plan=${defaultPlan}`);
        } else if (result.whatsappUrl) {
          window.location.href = result.whatsappUrl;
        } else {
          router.push("/profile");
        }
      }, welcomeDelay);
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Activa tu cuenta</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          30 días de acceso · Configuración incluida
        </p>
        {defaultPlan && PLAN_DISPLAY[defaultPlan] && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Plan seleccionado: <strong>{PLAN_DISPLAY[defaultPlan]}</strong>
          </div>
        )}
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Step panels */}
          <div className={cn(step === 1 ? "block" : "hidden")}>
            <Step1Fields form={form} />
          </div>
          <div className={cn(step === 2 ? "block" : "hidden")}>
            <Step2Fields
              form={form}
              countries={countries}
              areaCode={areaCode}
              setAreaCode={setAreaCode}
            />
          </div>
          <div className={cn(step === 3 ? "block" : "hidden")}>
            <Step3Fields form={form} />
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep((s) => s - 1)}
                disabled={isPending}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Atrás
              </Button>
            )}

            {step < 3 ? (
              <Button
                type="button"
                className={cn(step === 1 ? "w-full" : "flex-1")}
                onClick={handleNextStep}
              >
                Continuar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  "Crear cuenta"
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground mt-6">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
};

export default FormRegister;
