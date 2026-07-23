'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight, Loader2, CheckCircle2,
  Eye, EyeOff, Lock, Mail, User, Phone,
} from 'lucide-react';
import { CountryCodeSelect } from '@/components/custom/CountryCodeSelect';
import { Button } from '@/components/ui/button';
import { submitRegistroReunion, type RegistroReunionPayload } from '@/actions/registro-reunion-actions';
import { fullRegisterAction } from '@/actions/register-full-action';

/* ─── Constants ─── */
const COUNTRY_TIMEZONES: Record<string, string> = {
  Afghanistan:               'Asia/Kabul',
  Albania:                   'Europe/Tirane',
  Algeria:                   'Africa/Algiers',
  Argentina:                 'America/Argentina/Buenos_Aires',
  Armenia:                   'Asia/Yerevan',
  Australia:                 'Australia/Sydney',
  Austria:                   'Europe/Vienna',
  Azerbaijan:                'Asia/Baku',
  Bahrain:                   'Asia/Bahrain',
  Bangladesh:                'Asia/Dhaka',
  Belarus:                   'Europe/Minsk',
  Belgium:                   'Europe/Brussels',
  Bolivia:                   'America/La_Paz',
  'Bosnia and Herzegovina':  'Europe/Sarajevo',
  Brazil:                    'America/Sao_Paulo',
  Bulgaria:                  'Europe/Sofia',
  Cambodia:                  'Asia/Phnom_Penh',
  Cameroon:                  'Africa/Douala',
  Canada:                    'America/Toronto',
  Chile:                     'America/Santiago',
  China:                     'Asia/Shanghai',
  Colombia:                  'America/Bogota',
  Congo:                     'Africa/Kinshasa',
  'Costa Rica':              'America/Costa_Rica',
  Croatia:                   'Europe/Zagreb',
  Cuba:                      'America/Havana',
  'Czech Republic':          'Europe/Prague',
  Denmark:                   'Europe/Copenhagen',
  'Dominican Republic':      'America/Santo_Domingo',
  Ecuador:                   'America/Guayaquil',
  Egypt:                     'Africa/Cairo',
  'El Salvador':             'America/El_Salvador',
  Ethiopia:                  'Africa/Addis_Ababa',
  Finland:                   'Europe/Helsinki',
  France:                    'Europe/Paris',
  Georgia:                   'Asia/Tbilisi',
  Germany:                   'Europe/Berlin',
  Ghana:                     'Africa/Accra',
  Greece:                    'Europe/Athens',
  Guatemala:                 'America/Guatemala',
  Haiti:                     'America/Port-au-Prince',
  Honduras:                  'America/Tegucigalpa',
  Hungary:                   'Europe/Budapest',
  India:                     'Asia/Kolkata',
  Indonesia:                 'Asia/Jakarta',
  Iran:                      'Asia/Tehran',
  Iraq:                      'Asia/Baghdad',
  Ireland:                   'Europe/Dublin',
  Israel:                    'Asia/Jerusalem',
  Italy:                     'Europe/Rome',
  Jamaica:                   'America/Jamaica',
  Japan:                     'Asia/Tokyo',
  Jordan:                    'Asia/Amman',
  Kazakhstan:                'Asia/Almaty',
  Kenya:                     'Africa/Nairobi',
  Kuwait:                    'Asia/Kuwait',
  Lebanon:                   'Asia/Beirut',
  Libya:                     'Africa/Tripoli',
  Malaysia:                  'Asia/Kuala_Lumpur',
  Mexico:                    'America/Mexico_City',
  Morocco:                   'Africa/Casablanca',
  Mozambique:                'Africa/Maputo',
  Myanmar:                   'Asia/Rangoon',
  Nepal:                     'Asia/Kathmandu',
  Netherlands:               'Europe/Amsterdam',
  'New Zealand':             'Pacific/Auckland',
  Nicaragua:                 'America/Managua',
  Nigeria:                   'Africa/Lagos',
  Norway:                    'Europe/Oslo',
  Oman:                      'Asia/Muscat',
  Pakistan:                  'Asia/Karachi',
  Panama:                    'America/Panama',
  Paraguay:                  'America/Asuncion',
  Peru:                      'America/Lima',
  Philippines:               'Asia/Manila',
  Poland:                    'Europe/Warsaw',
  Portugal:                  'Europe/Lisbon',
  'Puerto Rico':             'America/Puerto_Rico',
  Qatar:                     'Asia/Qatar',
  Romania:                   'Europe/Bucharest',
  Russia:                    'Europe/Moscow',
  'Saudi Arabia':            'Asia/Riyadh',
  Senegal:                   'Africa/Dakar',
  Serbia:                    'Europe/Belgrade',
  Singapore:                 'Asia/Singapore',
  Slovakia:                  'Europe/Bratislava',
  'South Africa':            'Africa/Johannesburg',
  'South Korea':             'Asia/Seoul',
  Spain:                     'Europe/Madrid',
  'Sri Lanka':               'Asia/Colombo',
  Sudan:                     'Africa/Khartoum',
  Sweden:                    'Europe/Stockholm',
  Switzerland:               'Europe/Zurich',
  Syria:                     'Asia/Damascus',
  Taiwan:                    'Asia/Taipei',
  Tanzania:                  'Africa/Dar_es_Salaam',
  Thailand:                  'Asia/Bangkok',
  Tunisia:                   'Africa/Tunis',
  Turkey:                    'Europe/Istanbul',
  Uganda:                    'Africa/Kampala',
  Ukraine:                   'Europe/Kiev',
  'United Arab Emirates':    'Asia/Dubai',
  'United Kingdom':          'Europe/London',
  'United States':           'America/New_York',
  Uruguay:                   'America/Montevideo',
  Uzbekistan:                'Asia/Tashkent',
  Venezuela:                 'America/Caracas',
  Vietnam:                   'Asia/Ho_Chi_Minh',
  Yemen:                     'Asia/Aden',
  Zimbabwe:                  'Africa/Harare',
};
/* ─── Schema ─── */
const schema = z.object({
  pais:           z.string().min(1, 'Selecciona un país'),
  contacto:       z.string().min(5, 'Ingresa un número de contacto válido'),
  nombreNegocio:  z.string().min(2, 'Ingresa el nombre de tu negocio'),
  mensajesAlDia:  z.string().optional().default(''),
  asesores:       z.string().optional().default(''),
  procesoVentas:  z.string().optional().default(''),
  urgencia:       z.string().optional().default(''),
  salesObjective: z.string().optional().default(''),
  tono:           z.string().optional().default(''),
  mainProduct:    z.string().optional().default(''),
  clienteIdeal:   z.string().optional().default(''),
  nombre:         z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(64),
  email:          z.string().email('Ingresa un correo electrónico válido.'),
  password:       z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(32),
});

type FormValues = z.infer<typeof schema>;

/* ─── Shared field components ─── */
function TextField({ label, name, placeholder, register, error }: {
  label: string; name: keyof FormValues; placeholder?: string;
  register: ReturnType<typeof useForm<FormValues>>['register']; error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-200">
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

/* ─── Props ─── */
interface Props {
  resellerSlug?: string;
  resellerSheetsUrl?: string | null;
  resellerFormName?: string | null;
  countries?: any[];
  isReseller?: boolean;
}

export function RegistroReunionForm({ resellerSlug, resellerSheetsUrl, resellerFormName, countries = [], isReseller = false }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{ email: string; whatsappUrl?: string } | null>(null);
  const [dialCode, setDialCode] = useState('');
  const [localNumber, setLocalNumber] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState('');

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
  });

  const handleCountryChange = (code: string) => {
    setDialCode(code);
    const country = countries.find((c: any) =>
      (c.codes && c.codes.includes(code)) || c.code === code
    );
    if (country) {
      setValue('pais', country.name, { shouldValidate: true });
      const tz = COUNTRY_TIMEZONES[country.name];
      if (tz) setSelectedTimezone(tz);
    }
    const full = (code + localNumber.replace(/\D/g, '')).trim();
    setValue('contacto', full, { shouldValidate: !!full });
  };

  const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    setLocalNumber(digits);
    const full = (dialCode + digits).trim();
    setValue('contacto', full, { shouldValidate: !!full });
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    // 1. Guardar en Google Sheets
    await submitRegistroReunion({
      pais: values.pais,
      contacto: values.contacto,
      nombreNegocio: values.nombreNegocio,
      mensajesAlDia: values.mensajesAlDia,
      asesores: values.asesores,
      procesoVentas: values.procesoVentas,
      urgencia: values.urgencia,
      salesObjective: values.salesObjective,
      resellerSlug,
      resellerSheetsUrl,
      resellerFormName,
    } as RegistroReunionPayload).catch(() => null);

    // 2. Crear cuenta
    const timezone = selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await fullRegisterAction(
      {
        name: values.nombre,
        email: values.email,
        password: values.password,
        company: values.nombreNegocio,
        notificationNumber: values.contacto,
        timezone,
        salesObjective: values.salesObjective,
        businessSector: '',
        mainProduct: values.mainProduct ?? '',
        clienteIdeal: values.clienteIdeal ?? '',
        tono: values.tono ?? '',
      },
      undefined,
      undefined,
      resellerSlug,
      false
    );

    setIsSubmitting(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    setSuccessData({ email: values.email, whatsappUrl: result.whatsappUrl });
  };

  if (successData) {
    return (
      <div className="flex flex-col items-center gap-4 pt-4 pb-0 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-400" />
        <div>
          <h2 className="text-xl font-bold text-white">
            {isReseller ? '¡Bienvenido al programa!' : '¡Tu cuenta está lista!'}
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            {isReseller
              ? 'Tu cuenta de reseller fue creada. Accede para configurar tu marca y empezar a vender.'
              : 'Tu agente IA fue configurado y está listo para activarse.'}
          </p>
        </div>

        <div className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5">
          <p className="text-sm"><span className="text-slate-400">Tu correo de acceso: </span><span className="font-medium text-white">{successData.email}</span></p>
        </div>

        <div className="flex flex-col gap-2.5 w-full">
          <a
            href={isReseller ? '/panel/reseller' : '/profile?autoSetup=1'}
            className="w-full flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            {isReseller ? 'Ir a mi panel de reseller' : 'Conectar mi WhatsApp'}
          </a>
          {successData.whatsappUrl && (
            <a
              href={successData.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center rounded-lg border border-white/20 hover:bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition"
            >
              {isReseller ? 'Soporte por WhatsApp' : 'Quiero ayuda → Soporte por WhatsApp'}
            </a>
          )}
        </div>

        <p className="text-xs text-slate-500">
          {isReseller ? 'Panel de reseller · Soporte dedicado incluido' : '🔒 Tus datos se guardan de forma segura · 7 días · Sin tarjeta de crédito'}
        </p>
      </div>
    );
  }

  /* ── Formulario de una sola pantalla (cliente y reseller) ── */
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Activa tu cuenta 🚀</h2>
          <p className="text-slate-400 mt-1 text-sm">Cuéntanos de tu negocio y activa tu agente.</p>
        </div>

        {/* Fila 1: Nombre completo | Nombre del negocio */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-200">
              Nombre completo <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                {...register('nombre')}
                type="text"
                placeholder="Juan Pérez"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>

          <TextField
            label="Nombre del negocio"
            name="nombreNegocio"
            placeholder="ej. Clínica Dental Sonrisa"
            register={register}
            error={errors.nombreNegocio?.message}
          />
        </div>

        {/* Fila 2: Correo electrónico | Contraseña */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-200">
              Correo electrónico <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                {...register('email')}
                type="email"
                placeholder="tu@empresa.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-200">
              Contraseña <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
          </div>
        </div>

        {/* Fila 3: País | Número de contacto */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-200">
              País <span className="text-red-400">*</span>
            </label>
            <CountryCodeSelect countries={countries} value={dialCode} onChange={handleCountryChange} placeholder="Selecciona un país" />
            <p className="text-xs text-slate-500">Ej.: Rep. Dominicana: +1809, +1829, +1849.</p>
            <input type="hidden" {...register('pais')} />
            {errors.pais && <p className="text-xs text-red-400">{errors.pais.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-200">
              Número de contacto <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={localNumber}
                onChange={handleLocalNumberChange}
                type="tel"
                inputMode="numeric"
                placeholder="Número local"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <input type="hidden" {...register('contacto')} />
            <p className="text-xs text-slate-500">Recibirá notificaciones de tu cuenta.</p>
            {errors.contacto && <p className="text-xs text-red-400">{errors.contacto.message}</p>}
          </div>
        </div>

        {/* Botones uniformes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-1">
          <a
            href="/login"
            className="w-full flex items-center justify-center rounded-lg border border-white/20 hover:bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition"
          >
            Iniciar sesión
          </a>
          <Button type="submit" disabled={isSubmitting} size="lg" className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creando cuenta...</>
            ) : (
              <>Crear mi cuenta <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-slate-500">
          Al crear tu cuenta aceptas los Términos y la Política de privacidad.
        </p>
        <p className="text-center text-xs text-slate-500">
          🔒 Tus datos se guardan de forma segura · 7 días · Sin tarjeta de crédito
        </p>
      </form>
  );
}
