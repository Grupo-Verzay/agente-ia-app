'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { google } from 'googleapis';
import { revalidatePath } from 'next/cache';

// Definimos el tipo localmente para no depender de la versión del Prisma client
export type FormFieldType =
  | 'text' | 'textarea' | 'select' | 'radio' | 'multiselect'
  | 'checkbox' | 'file' | 'number' | 'money' | 'date' | 'time'
  | 'email' | 'phone' | 'url';

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

export type FormSubmissionData = {
  id: string;
  formId: string;
  formTitle: string;
  data: Record<string, unknown>;
  syncStatus: FormSubmissionSyncStatus;
  syncedAt: Date | null;
  syncError: string | null;
  createdAt: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

// ─── CRUD Formularios ─────────────────────────────────────────────────────────

export async function getMyForms(): Promise<{ success: boolean; forms?: FormData[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const forms = await db.form.findMany({
      where: { userId: user.id },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forms: forms.map((f: any) => ({
        id: f.id,
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
        _count: f._count,
        fields: f.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type as FormFieldType,
          placeholder: field.placeholder,
          required: field.required,
          order: field.order,
          options: (field.options as FormFieldOption[] | null) ?? null,
        })),
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getFormById(formId: string): Promise<{ success: boolean; form?: FormData; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const form = await db.form.findFirst({
      where: { id: formId, userId: user.id },
      include: {
        fields: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    if (!form) return { success: false, error: 'Formulario no encontrado' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = form as any;
    return {
      success: true,
      form: {
        id: form.id,
        title: form.title,
        slug: form.slug,
        publicSlug: f.publicSlug ?? null,
        description: form.description,
        sheetsUrl: form.sheetsUrl,
        isActive: form.isActive,
        whatsappEnabled: f.whatsappEnabled ?? false,
        whatsappNumber: f.whatsappNumber ?? null,
        whatsappMessage: f.whatsappMessage ?? null,
        createdAt: form.createdAt,
        _count: form._count,
        fields: form.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type as FormFieldType,
          placeholder: field.placeholder,
          required: field.required,
          order: field.order,
          options: (field.options as FormFieldOption[] | null) ?? null,
        })),
      },
    };
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
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) return { success: false, error: 'Slug inválido' };

    const existing = await db.form.findUnique({ where: { userId_slug: { userId: user.id, slug } } });
    if (existing) return { success: false, error: 'Ya tienes un formulario con ese slug' };

    const form = await db.form.create({
      data: {
        userId: user.id,
        title: input.title.trim(),
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
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const form = await db.form.findFirst({ where: { id: formId, userId: user.id } });
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.description !== undefined) data.description = input.description.trim() || null;
    if (input.sheetsUrl !== undefined) data.sheetsUrl = input.sheetsUrl.trim() || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.whatsappEnabled !== undefined) data.whatsappEnabled = input.whatsappEnabled;
    if (input.whatsappNumber !== undefined) data.whatsappNumber = input.whatsappNumber.trim() || null;
    if (input.whatsappMessage !== undefined) data.whatsappMessage = input.whatsappMessage.trim() || null;

    if (input.slug !== undefined) {
      const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!slug) return { success: false, error: 'Slug inválido' };
      const conflict = await db.form.findFirst({ where: { userId: user.id, slug, NOT: { id: formId } } });
      if (conflict) return { success: false, error: 'Ya tienes un formulario con ese slug' };
      data.slug = slug;
    }

    await db.form.update({ where: { id: formId }, data });
    revalidatePath('/mis-formularios');
    revalidatePath(`/mis-formularios/${formId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteForm(formId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    await db.form.deleteMany({ where: { id: formId, userId: user.id } });
    revalidatePath('/mis-formularios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── CRUD Campos ──────────────────────────────────────────────────────────────

export async function addFormField(
  formId: string,
  input: { label: string; type: FormFieldType; placeholder?: string; required?: boolean; options?: FormFieldOption[] },
): Promise<{ success: boolean; field?: FormFieldData; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const form = await db.form.findFirst({ where: { id: formId, userId: user.id } });
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    const maxOrder = await db.formField.aggregate({ where: { formId }, _max: { order: true } });
    const order = (maxOrder._max.order ?? -1) + 1;

    const field = await db.formField.create({
      data: {
        formId,
        label: input.label.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: input.type as any,
        placeholder: input.placeholder?.trim() || null,
        required: input.required ?? false,
        order,
        options: (input.options?.length ? input.options : null) as never,
      },
    });

    revalidatePath(`/mis-formularios/${formId}`);
    return {
      success: true,
      field: {
        id: field.id,
        label: field.label,
        type: field.type as FormFieldType,
        placeholder: field.placeholder,
        required: field.required,
        order: field.order,
        options: (field.options as FormFieldOption[] | null) ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateFormField(
  fieldId: string,
  input: { label?: string; type?: FormFieldType; placeholder?: string; required?: boolean; options?: FormFieldOption[] },
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const field = await db.formField.findFirst({
      where: { id: fieldId },
      include: { form: { select: { userId: true } } },
    });
    if (!field || field.form.userId !== user.id) return { success: false, error: 'Campo no encontrado' };

    const data: Record<string, unknown> = {};
    if (input.label !== undefined) data.label = input.label.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.type !== undefined) data.type = input.type as any;
    if (input.placeholder !== undefined) data.placeholder = input.placeholder.trim() || null;
    if (input.required !== undefined) data.required = input.required;
    if (input.options !== undefined) data.options = input.options.length ? input.options : null;

    await db.formField.update({ where: { id: fieldId }, data });
    revalidatePath(`/mis-formularios/${field.formId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFormField(fieldId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const field = await db.formField.findFirst({
      where: { id: fieldId },
      include: { form: { select: { userId: true, id: true } } },
    });
    if (!field || field.form.userId !== user.id) return { success: false, error: 'Campo no encontrado' };

    await db.formField.delete({ where: { id: fieldId } });
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
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const form = await db.form.findFirst({ where: { id: formId, userId: user.id } });
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    await db.$transaction(
      orderedIds.map((id, index) => db.formField.update({ where: { id }, data: { order: index } })),
    );

    revalidatePath(`/mis-formularios/${formId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Formulario Público ───────────────────────────────────────────────────────

export async function getPublicFormBySlug(
  userId: string,
  slug: string,
): Promise<{ success: boolean; form?: FormData; error?: string }> {
  try {
    const form = await db.form.findFirst({
      where: { userId, slug, isActive: true },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!form) return { success: false, error: 'Formulario no encontrado' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = form as any;
    return {
      success: true,
      form: {
        id: form.id,
        title: form.title,
        slug: form.slug,
        publicSlug: f.publicSlug ?? null,
        description: form.description,
        sheetsUrl: form.sheetsUrl,
        isActive: form.isActive,
        whatsappEnabled: f.whatsappEnabled ?? false,
        whatsappNumber: f.whatsappNumber ?? null,
        whatsappMessage: f.whatsappMessage ?? null,
        createdAt: form.createdAt,
        fields: form.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type as FormFieldType,
          placeholder: field.placeholder,
          required: field.required,
          order: field.order,
          options: (field.options as FormFieldOption[] | null) ?? null,
        })),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getFormByPublicSlug(
  publicSlug: string,
): Promise<{ success: boolean; form?: FormData; userId?: string; error?: string }> {
  try {
    const form = await db.form.findUnique({
      where: { publicSlug },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!form || !form.isActive) return { success: false, error: 'Formulario no encontrado' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = form as any;
    return {
      success: true,
      userId: form.userId,
      form: {
        id: form.id,
        title: form.title,
        slug: form.slug,
        publicSlug: f.publicSlug ?? null,
        description: form.description,
        sheetsUrl: form.sheetsUrl,
        isActive: form.isActive,
        whatsappEnabled: f.whatsappEnabled ?? false,
        whatsappNumber: f.whatsappNumber ?? null,
        whatsappMessage: f.whatsappMessage ?? null,
        createdAt: form.createdAt,
        fields: form.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type as FormFieldType,
          placeholder: field.placeholder,
          required: field.required,
          order: field.order,
          options: (field.options as FormFieldOption[] | null) ?? null,
        })),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateFormPublicSlug(
  formId: string,
  slug: string,
): Promise<{ success: boolean; slug?: string; message?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: 'No autenticado' };

    const normalized = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!normalized) return { success: false, message: 'Slug inválido' };

    const form = await db.form.findFirst({ where: { id: formId, userId: user.effectiveId as string } });
    if (!form) return { success: false, message: 'Formulario no encontrado' };

    const existing = await db.form.findUnique({ where: { publicSlug: normalized } });
    if (existing && existing.id !== formId) {
      return { success: false, message: 'Ese nombre ya está en uso' };
    }

    await db.form.update({ where: { id: formId }, data: { publicSlug: normalized } });

    revalidatePath(`/f/${normalized}`);
    return { success: true, slug: normalized };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function submitFormResponse(
  formId: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const form = await db.form.findUnique({
      where: { id: formId },
      select: { id: true, title: true, sheetsUrl: true, fields: { orderBy: { order: 'asc' } } },
    });
    if (!form) return { success: false, error: 'Formulario no encontrado' };

    const submission = await db.formSubmission.create({
      data: { formId, data: data as never, syncStatus: 'PENDING' },
    });

    if (form.sheetsUrl) {
      const sheetId = extractSpreadsheetId(form.sheetsUrl);
      if (sheetId) {
        try {
          const auth = getAuth();
          const sheets = google.sheets({ version: 'v4', auth });
          const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

          // Obtener o crear pestaña con el nombre del formulario
          const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
          const existingSheet = spreadsheet.data.sheets?.find(
            (s) => s.properties?.title === form.title,
          );

          if (!existingSheet) {
            // Crear la pestaña
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: sheetId,
              requestBody: {
                requests: [{ addSheet: { properties: { title: form.title } } }],
              },
            });

            // Agregar fila de cabecera
            const headers = ['ID', 'Fecha', ...form.fields.map((f) => f.label)];
            await sheets.spreadsheets.values.append({
              spreadsheetId: sheetId,
              range: `'${form.title}'!A1`,
              valueInputOption: 'RAW',
              requestBody: { values: [headers] },
            });
          }

          // Fila de datos usando el orden de los campos
          const values = form.fields.map((f) => {
            const val = data[f.id];
            if (Array.isArray(val)) return (val as string[]).join(', ');
            if (typeof val === 'boolean') return val ? 'Sí' : 'No';
            return String(val ?? '');
          });
          const row = [submission.id, fecha, ...values];

          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `'${form.title}'!A:Z`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [row] },
          });

          await db.formSubmission.update({
            where: { id: submission.id },
            data: { syncStatus: 'SYNCED', syncedAt: new Date() },
          });
        } catch (syncErr) {
          await db.formSubmission.update({
            where: { id: submission.id },
            data: {
              syncStatus: 'ERROR',
              syncError: syncErr instanceof Error ? syncErr.message : 'Error al sincronizar con Google Sheets',
            },
          });
        }
      }
    } else {
      await db.formSubmission.update({
        where: { id: submission.id },
        data: { syncStatus: 'SYNCED', syncedAt: new Date() },
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
): Promise<{ success: boolean; submissions?: FormSubmissionData[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const where = formId
      ? { formId, form: { userId: user.id } }
      : { form: { userId: user.id } };

    const submissions = await db.formSubmission.findMany({
      where,
      include: { form: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return {
      success: true,
      submissions: submissions.map((s) => ({
        id: s.id,
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
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const submission = await db.formSubmission.findFirst({
      where: { id: submissionId },
      include: { form: { select: { userId: true, title: true, sheetsUrl: true, fields: { orderBy: { order: 'asc' } } } } },
    });
    if (!submission || submission.form.userId !== user.id) return { success: false, error: 'No encontrado' };
    if (!submission.form.sheetsUrl) return { success: false, error: 'El formulario no tiene Google Sheets configurado' };

    const sheetId = extractSpreadsheetId(submission.form.sheetsUrl);
    if (!sheetId) return { success: false, error: 'URL de Google Sheets inválida' };

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const fecha = submission.createdAt.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const data = submission.data as Record<string, unknown>;
    const formTitle = submission.form.title;
    const fields = submission.form.fields;

    // Verificar/crear pestaña
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const exists = spreadsheet.data.sheets?.some((s) => s.properties?.title === formTitle);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: formTitle } } }] },
      });
      const headers = ['ID', 'Fecha', ...fields.map((f) => f.label)];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `'${formTitle}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }

    const values = fields.map((f) => {
      const val = data[f.id];
      return Array.isArray(val) ? (val as string[]).join(', ') : String(val ?? '');
    });
    const row = [submission.id, fecha, ...values];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${formTitle}'!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    await db.formSubmission.update({
      where: { id: submissionId },
      data: { syncStatus: 'SYNCED', syncedAt: new Date(), syncError: null },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFormSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autorizado' };

    const submission = await db.formSubmission.findFirst({
      where: { id: submissionId },
      include: { form: { select: { userId: true } } },
    });
    if (!submission || submission.form.userId !== user.id) return { success: false, error: 'No encontrado' };

    await db.formSubmission.delete({ where: { id: submissionId } });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
