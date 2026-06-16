'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Upload, X, FileText } from 'lucide-react';
import { submitFormResponse, type FormData, type FormFieldData, type FormFieldType } from '@/actions/forms-actions';

interface Props {
  form: FormData;
}

export function PublicFormClient({ form }: Props) {
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (id: string, val: string | boolean | string[]) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const toggleMulti = (id: string, option: string) => {
    const current = (values[id] as string[]) ?? [];
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    set(id, next);
  };

  const handleFileChange = async (fieldId: string, file: File) => {
    setUploading((p) => ({ ...p, [fieldId]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-form-file', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) {
        setErrors((prev) => ({ ...prev, [fieldId]: json.error ?? 'Error al subir archivo' }));
      } else {
        // Store as JSON string with name + url
        set(fieldId, JSON.stringify({ name: json.name, url: json.url }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [fieldId]: 'Error de conexión al subir archivo' }));
    } finally {
      setUploading((p) => ({ ...p, [fieldId]: false }));
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    for (const field of form.fields) {
      if (!field.required) continue;
      const val = values[field.id];
      if (field.type === 'checkbox') {
        if (!val) errs[field.id] = 'Este campo es requerido';
      } else if (field.type === 'multiselect') {
        if (!Array.isArray(val) || val.length === 0) errs[field.id] = 'Selecciona al menos una opción';
      } else if (field.type === 'file') {
        if (!val || String(val).trim() === '') errs[field.id] = 'Este campo es requerido';
        if (uploading[field.id]) errs[field.id] = 'Espera a que termine la carga del archivo';
      } else if (!val || String(val).trim() === '') {
        errs[field.id] = 'Este campo es requerido';
      }
    }
    return errs;
  };

  const buildWpUrl = (data: Record<string, unknown>) => {
    if (!form.whatsappEnabled || !form.whatsappNumber || !form.whatsappMessage) return null;
    const num = form.whatsappNumber.replace(/\D/g, '');
    let msg = form.whatsappMessage;
    for (const field of form.fields) {
      const raw = data[field.id];
      let display = '';
      if (Array.isArray(raw)) {
        display = (raw as string[]).join(', ');
      } else if (typeof raw === 'boolean') {
        display = raw ? 'Sí' : 'No';
      } else if (field.type === 'file' && typeof raw === 'string' && raw.startsWith('{')) {
        try { display = JSON.parse(raw).url; } catch { display = String(raw); }
      } else {
        display = String(raw ?? '');
      }
      msg = msg.replace(new RegExp(`\\{\\{${field.label}\\}\\}`, 'g'), display);
    }
    return `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // Build payload — for file fields, store URL only
    const payload: Record<string, unknown> = {};
    for (const field of form.fields) {
      const val = values[field.id];
      if (field.type === 'file' && typeof val === 'string' && val.startsWith('{')) {
        try { payload[field.id] = JSON.parse(val).url; } catch { payload[field.id] = val; }
      } else {
        payload[field.id] = val ?? '';
      }
    }

    setSubmitting(true);
    const res = await submitFormResponse(form.id, payload);
    setSubmitting(false);

    if (!res.success) {
      setErrors({ _global: res.error ?? 'Error al enviar. Intenta de nuevo.' });
      return;
    }

    setSubmitted(true);

    // Redirigir a WhatsApp después de mostrar el mensaje de éxito
    const url = buildWpUrl(payload);
    if (url) setTimeout(() => { window.location.href = url; }, 1500);
  };

  // ── Pantalla de éxito ────────────────────────────────────────────────────────
  if (submitted) {
    const hasWhatsApp = form.whatsappEnabled && form.whatsappNumber && form.whatsappMessage;
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="p-4 rounded-full bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">¡Registro enviado!</h2>
        <p className="text-slate-400 text-sm max-w-sm">
          Gracias por completar el formulario. Te contactaremos pronto.
        </p>
        {hasWhatsApp && (
          <div className="flex items-center gap-2 mt-2 text-sm text-[#25D366]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Abriendo WhatsApp...
          </div>
        )}
      </div>
    );
  }

  // ── Formulario ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 flex flex-col gap-5">
        {form.fields.map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            value={values[field.id]}
            error={errors[field.id]}
            uploading={uploading[field.id] ?? false}
            onChange={(v) => set(field.id, v)}
            onToggleMulti={(opt) => toggleMulti(field.id, opt)}
            onFileChange={(file) => handleFileChange(field.id, file)}
          />
        ))}
      </div>

      {errors._global && (
        <p className="text-sm text-red-400 text-center">{errors._global}</p>
      )}

      <button
        type="submit"
        disabled={submitting || Object.values(uploading).some(Boolean)}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed px-6 py-3 text-sm font-semibold text-white transition"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? 'Enviando...' : 'Enviar formulario'}
      </button>
    </form>
  );
}

// ─── Campo dinámico ───────────────────────────────────────────────────────────

function DynamicField({
  field, value, error, uploading, onChange, onToggleMulti, onFileChange,
}: {
  field: FormFieldData;
  value: string | boolean | string[] | undefined;
  error?: string;
  uploading: boolean;
  onChange: (v: string | boolean | string[]) => void;
  onToggleMulti: (opt: string) => void;
  onFileChange: (file: File) => void;
}) {
  const base = 'w-full rounded-lg border bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:ring-1';
  const ok = 'border-white/10 focus:border-blue-500 focus:ring-blue-500';
  const bad = 'border-red-500 focus:border-red-500 focus:ring-red-500';
  const cls = `${base} ${error ? bad : ok}`;
  const type = field.type as FormFieldType;

  const label = (
    <label className="text-sm font-medium text-slate-300">
      {field.label}
      {field.required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
  const errEl = error ? <p className="text-xs text-red-400">{error}</p> : null;

  // ── Checkbox ────────────────────────────────────────────────────────────────
  if (type === 'checkbox') {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={field.id} className="flex items-center justify-between gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors">
          <span className="text-sm text-slate-300">
            {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
          </span>
          <input type="checkbox" id={field.id} checked={(value as boolean) ?? false} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500 shrink-0" />
        </label>
        {errEl}
      </div>
    );
  }

  // ── Selección múltiple ──────────────────────────────────────────────────────
  if (type === 'multiselect') {
    const selected = (value as string[]) ?? [];
    return (
      <div className="flex flex-col gap-2">
        {label}
        <div className="flex flex-col gap-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt.value} onClick={() => onToggleMulti(opt.value)} className="flex items-center justify-between gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors">
              <span className="text-sm text-slate-300">{opt.label}</span>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => onToggleMulti(opt.value)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500 shrink-0" />
            </label>
          ))}
        </div>
        {errEl}
      </div>
    );
  }

  // ── Selección simple (radio) ─────────────────────────────────────────────────
  if (type === 'radio') {
    return (
      <div className="flex flex-col gap-2">
        {label}
        <div className="flex flex-col gap-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt.value} className="flex items-center justify-between gap-3 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors">
              <span className="text-sm text-slate-300">{opt.label}</span>
              <input type="radio" name={field.id} value={opt.value} checked={(value as string) === opt.value} onChange={() => onChange(opt.value)} className="h-4 w-4 border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500 shrink-0" />
            </label>
          ))}
        </div>
        {errEl}
      </div>
    );
  }

  // ── Área de texto ────────────────────────────────────────────────────────────
  if (type === 'textarea') {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder ?? ''} className={`${cls} resize-none`} />
        {errEl}
      </div>
    );
  }

  // ── Desplegable ───────────────────────────────────────────────────────────────
  if (type === 'select') {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={`${cls} [&>option]:bg-slate-800 [&>option]:text-white`}>
          <option value="">Seleccionar...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {errEl}
      </div>
    );
  }

  // ── Archivo ───────────────────────────────────────────────────────────────────
  if (type === 'file') {
    let fileInfo: { name: string; url: string } | null = null;
    if (typeof value === 'string' && value.startsWith('{')) {
      try { fileInfo = JSON.parse(value); } catch { /* ignore */ }
    }

    return (
      <div className="flex flex-col gap-1.5">
        {label}
        {fileInfo ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <FileText className="w-4 h-4 text-green-400 shrink-0" />
            <a href={fileInfo.url} target="_blank" rel="noopener noreferrer" className="text-sm text-green-400 hover:underline flex-1 truncate">
              {fileInfo.name}
            </a>
            <button type="button" onClick={() => onChange('')} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className={`flex items-center gap-2 cursor-pointer ${base} ${error ? bad : ok} justify-center py-4 ${uploading ? 'opacity-60 cursor-wait' : ''}`}>
            {uploading
              ? <><Loader2 className="w-4 h-4 text-slate-400 animate-spin" /><span className="text-slate-400 text-sm">Subiendo...</span></>
              : <><Upload className="w-4 h-4 text-slate-400" /><span className="text-slate-400 text-sm">{field.placeholder ?? 'Seleccionar archivo (máx. 10MB)'}</span></>
            }
            <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileChange(f); }} />
          </label>
        )}
        {errEl}
      </div>
    );
  }

  // ── Monto ──────────────────────────────────────────────────────────────────
  if (type === 'money') {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
          <input type="number" min="0" step="0.01" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder ?? '0.00'} className={`${cls} pl-7`} />
        </div>
        {errEl}
      </div>
    );
  }

  // ── Tipos simples ──────────────────────────────────────────────────────────
  const inputType: Record<string, string> = { date: 'date', time: 'time', email: 'email', phone: 'tel', url: 'url', number: 'number' };
  const extraCls = ['date', 'time'].includes(type) ? ' [color-scheme:dark]' : '';
  const placeholder = field.placeholder ?? (type === 'email' ? 'correo@ejemplo.com' : type === 'phone' ? '573001234567' : type === 'url' ? 'https://...' : '');

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <input
        type={inputType[type] ?? 'text'}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${cls}${extraCls}`}
      />
      {errEl}
    </div>
  );
}
