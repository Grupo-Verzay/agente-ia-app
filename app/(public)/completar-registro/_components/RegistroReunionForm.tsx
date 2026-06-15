'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bot, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitRegistroReunion, type RegistroReunionPayload } from '@/actions/registro-reunion-actions';

const PAISES = [
  'Venezuela', 'Colombia', 'México', 'Perú', 'Chile', 'Argentina',
  'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guatemala', 'Honduras',
  'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Cuba',
  'República Dominicana', 'Puerto Rico', 'España', 'Otro',
];

const MENSAJES = ['10 - 30', '30 - 50', '50 - 100', '150 - 300', '300+'];
const ASESORES = ['1 - 3', '3 - 5', '5 - 10', '10+'];
const PROCESO  = ['Sí', 'No'];

const schema = z.object({
  pais:           z.string().min(1, 'Selecciona un país'),
  contacto:       z.string().min(5, 'Ingresa un número de contacto válido'),
  nombreNegocio:  z.string().min(2, 'Ingresa el nombre de tu negocio'),
  mensajesAlDia:  z.string().min(1, 'Selecciona una opción'),
  asesores:       z.string().min(1, 'Selecciona una opción'),
  procesoVentas:  z.string().min(1, 'Selecciona una opción'),
  urgencia:       z.string().min(10, 'Describe brevemente tu urgencia'),
  tareasObjetivos: z.string().min(10, 'Describe los objetivos que necesitas'),
});

type FormValues = z.infer<typeof schema>;

function SelectField({
  label, name, options, register, error,
}: {
  label: string;
  name: keyof FormValues;
  options: string[];
  register: ReturnType<typeof useForm<FormValues>>['register'];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-300">
        {label} <span className="text-red-400">*</span>
      </label>
      <select
        {...register(name)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
      >
        <option value="">Seleccionar...</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextField({
  label, name, placeholder, register, error,
}: {
  label: string;
  name: keyof FormValues;
  placeholder?: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-300">
        {label} <span className="text-red-400">*</span>
      </label>
      <input
        {...register(name)}
        type="text"
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextareaField({
  label, name, placeholder, register, error,
}: {
  label: string;
  name: keyof FormValues;
  placeholder?: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-300">
        {label} <span className="text-red-400">*</span>
      </label>
      <textarea
        {...register(name)}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function RegistroReunionForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await submitRegistroReunion(values as RegistroReunionPayload);
    if (!result.success) {
      setServerError(result.error ?? 'Error al enviar. Intenta de nuevo.');
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push('/register'), 2000);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-400" />
        <h2 className="text-2xl font-bold text-white">¡Datos recibidos!</h2>
        <p className="text-slate-400">Redirigiendo para crear tu cuenta...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          label="País"
          name="pais"
          options={PAISES}
          register={register}
          error={errors.pais?.message}
        />
        <TextField
          label="# Contacto (WhatsApp)"
          name="contacto"
          placeholder="ej. 573001234567"
          register={register}
          error={errors.contacto?.message}
        />
      </div>

      <TextField
        label="Nombre del negocio"
        name="nombreNegocio"
        placeholder="ej. Clínica Dental Sonrisa"
        register={register}
        error={errors.nombreNegocio?.message}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:items-end">
        <SelectField
          label="¿Cuántos mensajes recibes al día aprox.?"
          name="mensajesAlDia"
          options={MENSAJES}
          register={register}
          error={errors.mensajesAlDia?.message}
        />
        <SelectField
          label="¿Cuántos asesores de ventas tiene tu empresa?"
          name="asesores"
          options={ASESORES}
          register={register}
          error={errors.asesores?.message}
        />
        <SelectField
          label="¿Ya cuentas con un proceso de ventas?"
          name="procesoVentas"
          options={PROCESO}
          register={register}
          error={errors.procesoVentas?.message}
        />
      </div>

      <TextareaField
        label="¿Cuál es tu urgencia y las problemáticas actuales?"
        name="urgencia"
        placeholder="Describe brevemente qué problema quieres resolver..."
        register={register}
        error={errors.urgencia?.message}
      />

      <TextareaField
        label="¿Qué tareas y objetivos necesitas que realice la IA?"
        name="tareasObjetivos"
        placeholder="Ej: Responder preguntas frecuentes, agendar citas, hacer seguimiento de leads..."
        register={register}
        error={errors.tareasObjetivos?.message}
      />

      {serverError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className="mt-1 gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
        ) : (
          <>Continuar y crear mi cuenta <ArrowRight className="h-4 w-4" /></>
        )}
      </Button>

      <p className="text-center text-xs text-slate-500">
        Tus datos se guardan de forma segura. Al continuar podrás crear tu cuenta gratis.
      </p>
    </form>
  );
}
