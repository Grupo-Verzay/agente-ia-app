'use server';

import { db } from '@/lib/db';
import { google } from 'googleapis';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import {
  elSlugDelFormulario, esTipoDeCampo, laCabeceraDeLaHoja, laFilaDelRegistro,
  laPestanaDelFormulario, elRangoDeLaPestana, lasRespuestasQueSeGuardan,
  losConteosDeRegistros, comoFiltroDeSincronizacion, type TipoDeCampo,
} from '@/lib/formularios';
import { elPrefijoDeArchivos } from '@/lib/archivos-de-formularios.server';

/**
 * Mis formularios (`/mis-formularios`) y el formulario público (`/f/...`).
 *
 * Todo lo de esta pantalla es de la CUENTA, no de la persona: la lista sale de
 * `laCuentaDeLaAccion()` (la fila efectiva) y lo que recibe un id de
 * formulario, de campo o de registro saca el DUEÑO de la fila y lo pregunta
 * con la misma puerta (`elFormularioQueAlcanza`, `elCampoQueAlcanza`,
 * `elRegistroQueAlcanza`). Antes unas acciones iban con `user.id` y otra
 * —la URL personalizada— con `effectiveId`, así que para alguien del equipo
 * una parte de la pantalla funcionaba y la otra contestaba «no encontrado».
 *
 * Lo público lo es a propósito y lo dice: `getPublicFormBySlug`,
 * `getFormByPublicSlug` y `submitFormResponse` las abre `/f/...`, que no tiene
 * sesión. No devuelven la hoja de Google Sheets —detrás están los registros
 * de todos— y el envío solo guarda lo que es un campo del formulario.
 */

export type FormFieldType = TipoDeCampo;

type FormSubmissionSyncStatus = 'PENDING' | 'SYNCED' | 'ERROR';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FormFieldOption = { label: string; value: string };

export type FormFieldData = {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder: string | null;
  required: boolean;
  order: number;
  options: FormFieldOption[] | null;
};

export type FormData = {
  id: string;
  /** La cuenta DUEÑA: con ella se arma el enlace público. */
  userId: string;
  title: string;
  slug: string;
  publicSlug: string | null;
  description: string | null;
  sheetsUrl: string | null;
  isActive: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  whatsappMessage: string | null;
  createdAt: Date;
  fields: FormFieldData[];
  _count?: { submissions: number };
};

/** Lo que ve quien llena el formulario: sin la hoja de Google ni los conteos. */
export type PublicFormData = Omit<FormData, 'sheetsUrl' | '_count'>;

export type FormSubmissionData = {
  id: string;
  /**
   * Su número dentro del formulario (el primero que llegó es el 1), contado en
   * el servidor: con un filtro puesto la lista no es seguida, y numerar por la
   * posición en pantalla diría otra cosa.
   */
  numero: number | null;
  formId: string;
  formTitle: string;
  data: Record<string, unknown>;
  syncStatus: FormSubmissionSyncStatus;
  syncedAt: Date | null;
  syncError: string | null;
  createdAt: Date;
};

export type ConteosDeRegistros = { total: number; sincronizados: number; pendientes: number; conError: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON (o GOOGLE_SHEETS_CREDENTIALS)');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

type FilaDeFormulario = {
  id: string; userId: string; title: string; slug: string; publicSlug: string | null;
  description: string | null; sheetsUrl: string | null; isActive: boolean;
  whatsappEnabled: boolean | null; whatsappNumber: string | null; whatsappMessage: string | null;
  createdAt: Date;
  fields: Array<{ id: string; label: string; type: string; placeholder: string | null; required: boolean; order: number; options: unknown }>;
  _count?: { submissions: number };
};

function comoCampo(field: FilaDeFormulario['fields'][number]): FormFieldData {
  return {
    id: field.id,
    label: field.label,
    type: field.type as FormFieldType,
    placeholder: field.placeholder,
    required: field.required,
    order: field.order,
    options: (field.options as FormFieldOption[] | null) ?? null,
  };
}

/** Una fila de `forms` como la pinta la pantalla. Estaba copiada cuatro veces. */
function comoFormulario(f: FilaDeFormulario): FormData {
  return {
    id: f.id,
    userId: f.userId,
    title: f.title,
    slug: f.slug,
    publicSlug: f.publicSlug ?? null,
    description: f.description,
    sheetsUrl: f.sheetsUrl,
    isActive: f.isActive,
    whatsappEnabled: f.whatsappEnabled ?? false,
    whatsappNumber: f.whatsappNumber ?? null,
    whatsappMessage: f.whatsappMessage ?? null,
    createdAt: f.createdAt,
    ...(f._count ? { _count: f._count } : {}),
    fields: f.fields.map(comoCampo),
  };
}

/** Lo público: sin la hoja de Google, que detrás tiene los registros de todos. */
function comoFormularioPublico(f: FilaDeFormulario): PublicFormData {
  const { sheetsUrl: _hoja, _count: _conteo, ...publico } = comoFormulario(f);
  return publico;
}

/**
 * El formulario, si quien llama alcanza a su DUEÑO. «No existe» y «no es tuyo»
 * se contestan igual: decir «no puedes» ya cuenta que existe.
 */
async function elFormularioQueAlcanza(formId: string): Promise<{ id: string; userId: string } | null> {
  if (typeof formId !== 'string' || !formId) return null;
  const fila = await db.form.findUnique({ where: { id: formId }, select: { id: true, userId: true } });
  if (!fila) return null;
  const cuenta = await laCuentaDeLaAccion(fila.userId);
  return cuenta ? fila : null;
}

async function elCampoQueAlcanza(fieldId: string): Promise<{ id: string; formId: string } | null> {
  if (typeof fieldId !== 'string' || !fieldId) return null;
  const fila = await db.formField.findUnique({
    where: { id: fieldId },
    select: { id: true, formId: true, form: { select: { userId: true } } },
  });
  if (!fila) return null;
  const cuenta = await laCuentaDeLaAccion(fila.form.userId);
  return cuenta ? { id: fila.id, formId: fila.formId } : null;
}

async function elRegistroQueAlcanza(submissionId: string): Promise<{ id: string; formId: string } | null> {
  if (typeof submissionId !== 'string' || !submissionId) return null;
  const fila = await db.formSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, formId: true, form: { select: { userId: true } } },
  });
  if (!fila) return null;
  const cuenta = await laCuentaDeLaAccion(fila.form.userId);
  return cuenta ? { id: fila.id, formId: fila.formId } : null;
}

/**
 * Escribe un registro en la hoja de Google del formulario. Es UNA función para
 * el envío y para «Reintentar»: estaban copiadas y ya decían cosas distintas
 * (una casilla salía «Sí» en una y «true» en la otra).
 *
 * La pestaña se busca sin mirar mayúsculas (`laPestanaDelFormulario`): Google
 * no deja crear otra que solo se diferencie en eso, y así fallaba cada
 * registro de un formulario cuyo título no coincidía letra a letra con la
 * pestaña que ya había.
 */
async function escribirEnLaHoja(
  form: { title: string; sheetsUrl: string; fields: Array<{ id: string; label: string }> },
  registro: { id: string; data: Record<string, unknown>; createdAt: Date },
): Promise<void> {
  const sheetId = extractSpreadsheetId(form.sheetsUrl);
  if (!sheetId) throw new Error('La dirección de Google Sheets no es válida');

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const fecha = registro.createdAt.toLocaleString('es-CO', { timeZone: 'America/Bogota' });

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const nombres = (spreadsheet.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
  const pestana = laPestanaDelFormulario(form.title, nombres);

  if (!pestana.existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: pestana.nombre } } }] },
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: elRangoDeLaPestana(pestana.nombre, 'A1'),
      valueInputOption: 'RAW',
      requestBody: { values: [laCabeceraDeLaHoja(form.fields)] },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: elRangoDeLaPestana(pestana.nombre, 'A1'),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [laFilaDelRegistro(form.fields, registro.data, registro.id, fecha)] },
  });
}

// ─── CRUD Formularios ─────────────────────────────────────────────────────────

export async function getMyForms(): Promise<{ success: boolean; forms?: FormData[]; error?: string }> {
  try {
    const cuenta = await laCuentaDeLaAccion();
    if (!cuenta) return { success: false, error: 'No autorizado' };

    const forms = await db.form.findMany({
      where: { userId: cuenta },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, forms: forms.map(comoFormulario) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getFormById(formId: string): Promise<{ success: boolean; form?: FormData; error?: string }> {
  try {
    const alcanzado = await elFormularioQueAlcanza(formId);
    if (!alcanzado) return { success: false, error: 'Formulario no encontrado' };

    const form = await db.form.findUnique({
      where: { id: alcanzado.id },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    return { success: true, form: comoFormulario(form) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createForm(input: {
  title: string;
  slug: string;
  description?: string;
  sheetsUrl?: string;
  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  whatsappMessage?: string;
}): Promise<{ success: boolean; formId?: string; error?: string }> {
  try {
    const cuenta = await laCuentaDeLaAccion();
    if (!cuenta) return { success: false, error: 'No autorizado' };

    const title = String(input.title ?? '').trim();
    if (!title) return { success: false, error: 'El título es obligatorio' };
    const slug = elSlugDelFormulario(String(input.slug ?? '') || title);
    if (!slug) return { success: false, error: 'Slug inválido' };

    const existing = await db.form.findUnique({ where: { userId_slug: { userId: cuenta, slug } } });
    if (existing) return { success: false, error: 'Ya tienes un formulario con ese slug' };

    const form = await db.form.create({
      data: {
        userId: cuenta,
        title,
        slug,
        description: input.description?.trim() || null,
        sheetsUrl: input.sheetsUrl?.trim() || null,
        whatsappEnabled: input.whatsappEnabled ?? false,
        whatsappNumber: input.whatsappNumber?.trim() || null,
        whatsappMessage: input.whatsappMessage?.trim() || null,
      },
    });

    revalidatePath('/mis-formularios');
    return { success: true, formId: form.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateForm(
  formId: string,
  input: {
    title?: string;
    slug?: string;
    description?: string;
    sheetsUrl?: string;
    isActive?: boolean;
    whatsappEnabled?: boolean;
    whatsappNumber?: string;
    whatsappMessage?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const form = await elFormularioQueAlcanza(formId);
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) return { success: false, error: 'El título es obligatorio' };
      data.title = title;
    }
    if (input.description !== undefined) data.description = input.description.trim() || null;
    if (input.sheetsUrl !== undefined) data.sheetsUrl = input.sheetsUrl.trim() || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.whatsappEnabled !== undefined) data.whatsappEnabled = input.whatsappEnabled;
    if (input.whatsappNumber !== undefined) data.whatsappNumber = input.whatsappNumber.trim() || null;
    if (input.whatsappMessage !== undefined) data.whatsappMessage = input.whatsappMessage.trim() || null;

    if (input.slug !== undefined) {
      const slug = elSlugDelFormulario(input.slug);
      if (!slug) return { success: false, error: 'Slug inválido' };
      const conflict = await db.form.findFirst({ where: { userId: form.userId, slug, NOT: { id: form.id } } });
      if (conflict) return { success: false, error: 'Ya tienes un formulario con ese slug' };
      data.slug = slug;
    }

    await db.form.update({ where: { id: form.id }, data });
    revalidatePath('/mis-formularios');
    revalidatePath(`/mis-formularios/${form.id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteForm(formId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const form = await elFormularioQueAlcanza(formId);
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    await db.form.delete({ where: { id: form.id } });
    revalidatePath('/mis-formularios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * El correo con el que la plataforma escribe en Google Sheets. Sin compartir
 * la hoja con él como editor, cada registro sale «Error» con un «The caller
 * does not have permission» que no dice qué hacer: por eso la pantalla lo
 * enseña debajo del campo de la hoja.
 */
export async function correoParaCompartirLaHoja(): Promise<string | null> {
  const cuenta = await laCuentaDeLaAccion();
  if (!cuenta) return null;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!raw) return null;
    const correo = (JSON.parse(raw) as { client_email?: unknown }).client_email;
    return typeof correo === 'string' ? correo : null;
  } catch {
    return null;
  }
}

// ─── CRUD Campos ──────────────────────────────────────────────────────────────

export async function addFormField(
  formId: string,
  input: { label: string; type: FormFieldType; placeholder?: string; required?: boolean; options?: FormFieldOption[] },
): Promise<{ success: boolean; field?: FormFieldData; error?: string }> {
  try {
    const form = await elFormularioQueAlcanza(formId);
    if (!form) return { success: false, error: 'Formulario no encontrado' };
    if (!esTipoDeCampo(input.type)) return { success: false, error: 'Tipo de campo no válido' };
    const label = String(input.label ?? '').trim();
    if (!label) return { success: false, error: 'La pregunta es obligatoria' };

    const maxOrder = await db.formField.aggregate({ where: { formId: form.id }, _max: { order: true } });
    const order = (maxOrder._max.order ?? -1) + 1;

    const field = await db.formField.create({
      data: {
        formId: form.id,
        label,
        type: input.type,
        placeholder: input.placeholder?.trim() || null,
        required: input.required ?? false,
        order,
        options: (input.options?.length ? input.options : null) as never,
      },
    });

    revalidatePath(`/mis-formularios/${form.id}`);
    return { success: true, field: comoCampo(field) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateFormField(
  fieldId: string,
  input: { label?: string; type?: FormFieldType; placeholder?: string; required?: boolean; options?: FormFieldOption[] },
): Promise<{ success: boolean; error?: string }> {
  try {
    const field = await elCampoQueAlcanza(fieldId);
    if (!field) return { success: false, error: 'Campo no encontrado' };

    const data: Record<string, unknown> = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) return { success: false, error: 'La pregunta es obligatoria' };
      data.label = label;
    }
    if (input.type !== undefined) {
      if (!esTipoDeCampo(input.type)) return { success: false, error: 'Tipo de campo no válido' };
      data.type = input.type;
    }
    if (input.placeholder !== undefined) data.placeholder = input.placeholder.trim() || null;
    if (input.required !== undefined) data.required = input.required;
    if (input.options !== undefined) data.options = input.options.length ? input.options : null;

    await db.formField.update({ where: { id: field.id }, data });
    revalidatePath(`/mis-formularios/${field.formId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFormField(fieldId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const field = await elCampoQueAlcanza(fieldId);
    if (!field) return { success: false, error: 'Campo no encontrado' };

    await db.formField.delete({ where: { id: field.id } });
    revalidatePath(`/mis-formularios/${field.formId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reorderFormFields(
  formId: string,
  orderedIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const form = await elFormularioQueAlcanza(formId);
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    // Solo los campos que SON de este formulario: una lista que llega de fuera
    // no puede mover los campos de otro.
    const suyos = new Set(
      (await db.formField.findMany({ where: { formId: form.id }, select: { id: true } })).map((c) => c.id),
    );
    const ids = (Array.isArray(orderedIds) ? orderedIds : []).filter((id) => suyos.has(id));

    await db.$transaction(
      ids.map((id, index) => db.formField.update({ where: { id }, data: { order: index } })),
    );

    revalidatePath(`/mis-formularios/${form.id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Formulario Público ───────────────────────────────────────────────────────

export async function getPublicFormBySlug(
  userId: string,
  slug: string,
): Promise<{ success: boolean; form?: PublicFormData; error?: string }> {
  try {
    const form = await db.form.findFirst({
      where: { userId, slug, isActive: true },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!form) return { success: false, error: 'Formulario no encontrado' };
    return { success: true, form: comoFormularioPublico(form) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getFormByPublicSlug(
  publicSlug: string,
): Promise<{ success: boolean; form?: PublicFormData; userId?: string; error?: string }> {
  try {
    const form = await db.form.findUnique({
      where: { publicSlug },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!form || !form.isActive) return { success: false, error: 'Formulario no encontrado' };
    return { success: true, userId: form.userId, form: comoFormularioPublico(form) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateFormPublicSlug(
  formId: string,
  slug: string,
): Promise<{ success: boolean; slug?: string; message?: string }> {
  try {
    const form = await elFormularioQueAlcanza(formId);
    if (!form) return { success: false, message: 'Formulario no encontrado' };

    const normalized = elSlugDelFormulario(String(slug ?? ''));
    if (!normalized) return { success: false, message: 'Slug inválido' };

    const existing = await db.form.findUnique({ where: { publicSlug: normalized } });
    if (existing && existing.id !== form.id) {
      return { success: false, message: 'Ese nombre ya está en uso' };
    }

    await db.form.update({ where: { id: form.id }, data: { publicSlug: normalized } });

    revalidatePath(`/f/${normalized}`);
    return { success: true, slug: normalized };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * El ENVÍO del formulario público. Lo llama quien lo llena, que no tiene
 * cuenta: por eso se comprueba aquí que el formulario siga ACTIVO —desactivar
 * tiene que cerrar también la petición directa, no solo esconder la página— y
 * solo se guarda lo que es un campo suyo (`lasRespuestasQueSeGuardan`).
 */
export async function submitFormResponse(
  formId: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof formId !== 'string' || !formId) return { success: false, error: 'Formulario no encontrado' };
    const form = await db.form.findUnique({
      where: { id: formId },
      select: { id: true, title: true, sheetsUrl: true, isActive: true, fields: { orderBy: { order: 'asc' } } },
    });
    if (!form || !form.isActive) return { success: false, error: 'Este formulario ya no recibe respuestas' };

    const guardable = lasRespuestasQueSeGuardan(
      form.fields.map((f) => ({ ...f, options: (f.options as FormFieldOption[] | null) ?? null })),
      data,
      elPrefijoDeArchivos(form.id),
    );
    if (!guardable.ok) return { success: false, error: guardable.error };

    const submission = await db.formSubmission.create({
      data: { formId: form.id, data: guardable.respuestas as never, syncStatus: 'PENDING' },
    });

    if (!form.sheetsUrl) {
      await db.formSubmission.update({
        where: { id: submission.id },
        data: { syncStatus: 'SYNCED', syncedAt: new Date() },
      });
      return { success: true };
    }

    try {
      await escribirEnLaHoja(
        { title: form.title, sheetsUrl: form.sheetsUrl, fields: form.fields },
        { id: submission.id, data: guardable.respuestas, createdAt: submission.createdAt },
      );
      await db.formSubmission.update({
        where: { id: submission.id },
        data: { syncStatus: 'SYNCED', syncedAt: new Date() },
      });
    } catch (syncErr) {
      // El registro YA está guardado: quien llenó el formulario no tiene por
      // qué enterarse de que la hoja falló. Pero no es mudo: queda el motivo
      // en la fila, que es lo que enseña la pantalla de registros.
      console.warn('[formularios] no se pudo escribir en Google Sheets', {
        formId: form.id,
        error: syncErr instanceof Error ? syncErr.message : syncErr,
      });
      await db.formSubmission.update({
        where: { id: submission.id },
        data: {
          syncStatus: 'ERROR',
          syncError: syncErr instanceof Error ? syncErr.message : 'Error al sincronizar con Google Sheets',
        },
      });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Registros / Submissions ──────────────────────────────────────────────────

export async function getFormSubmissions(
  formId?: string,
  estado?: unknown,
): Promise<{ success: boolean; submissions?: FormSubmissionData[]; conteos?: ConteosDeRegistros; error?: string }> {
  try {
    let where: Prisma.FormSubmissionWhereInput;
    if (formId) {
      const form = await elFormularioQueAlcanza(formId);
      if (!form) return { success: false, error: 'Formulario no encontrado' };
      where = { formId: form.id };
    } else {
      const cuenta = await laCuentaDeLaAccion();
      if (!cuenta) return { success: false, error: 'No autorizado' };
      where = { form: { userId: cuenta } };
    }

    // Las pastillas de la pantalla filtran la LISTA en el servidor —una
    // pastilla que promete «3 con error» tiene que poder enseñarlos aunque no
    // estén entre los 500 últimos—, y las cifras se cuentan siempre sin filtro.
    const filtro = comoFiltroDeSincronizacion(estado);
    const dondeLista: Prisma.FormSubmissionWhereInput = filtro === 'todos' ? where : { ...where, syncStatus: filtro };

    const [submissions, grupos] = await Promise.all([
      db.formSubmission.findMany({
        where: dondeLista,
        include: { form: { select: { title: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 500,
      }),
      db.formSubmission.groupBy({ by: ['syncStatus'], where, _count: true }),
    ]);

    // El número de cada registro en su formulario, en UNA consulta por página.
    const numeros = new Map<string, number>();
    if (formId && submissions.length > 0) {
      const filas = await db.$queryRaw<Array<{ id: string; n: number }>>`
        SELECT t."id", t."n" FROM (
          SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id")::int AS "n"
          FROM "form_submissions" WHERE "formId" = ${submissions[0].formId}
        ) t
        WHERE t."id" = ANY(${submissions.map((s) => s.id)}::text[])`;
      for (const f of filas) numeros.set(f.id, Number(f.n));
    }

    return {
      success: true,
      conteos: losConteosDeRegistros(grupos.map((g) => ({ syncStatus: g.syncStatus, _count: g._count }))),
      submissions: submissions.map((s) => ({
        id: s.id,
        numero: numeros.get(s.id) ?? null,
        formId: s.formId,
        formTitle: s.form.title,
        data: s.data as Record<string, unknown>,
        syncStatus: s.syncStatus,
        syncedAt: s.syncedAt,
        syncError: s.syncError,
        createdAt: s.createdAt,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function retrySheetSync(submissionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const alcanzado = await elRegistroQueAlcanza(submissionId);
    if (!alcanzado) return { success: false, error: 'No encontrado' };

    const submission = await db.formSubmission.findUnique({
      where: { id: alcanzado.id },
      include: { form: { select: { title: true, sheetsUrl: true, fields: { orderBy: { order: 'asc' } } } } },
    });
    if (!submission) return { success: false, error: 'No encontrado' };
    if (!submission.form.sheetsUrl) return { success: false, error: 'El formulario no tiene Google Sheets configurado' };

    try {
      await escribirEnLaHoja(
        { title: submission.form.title, sheetsUrl: submission.form.sheetsUrl, fields: submission.form.fields },
        { id: submission.id, data: submission.data as Record<string, unknown>, createdAt: submission.createdAt },
      );
    } catch (syncErr) {
      const motivo = syncErr instanceof Error ? syncErr.message : 'Error al sincronizar con Google Sheets';
      await db.formSubmission.update({ where: { id: submission.id }, data: { syncStatus: 'ERROR', syncError: motivo } });
      return { success: false, error: motivo };
    }

    await db.formSubmission.update({
      where: { id: submission.id },
      data: { syncStatus: 'SYNCED', syncedAt: new Date(), syncError: null },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFormSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const alcanzado = await elRegistroQueAlcanza(submissionId);
    if (!alcanzado) return { success: false, error: 'No encontrado' };

    await db.formSubmission.delete({ where: { id: alcanzado.id } });
    revalidatePath(`/mis-formularios/${alcanzado.formId}/registros`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
