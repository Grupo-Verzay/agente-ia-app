'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import OpenAI from 'openai';

// Embeddings (RAG semántico). Best-effort: si no hay clave OpenAI o falla, devuelve
// [] y el bloque queda solo con búsqueda por keywords (no rompe nada).
async function getUserOpenAiKey(userId: string): Promise<string | null> {
  try {
    const provider = await db.aiProvider.findFirst({ where: { name: 'openai' }, select: { id: true } });
    if (!provider) return null;
    const cfg = await db.userAiConfig.findFirst({
      where: { userId, providerId: provider.id, isActive: true },
      select: { apiKey: true },
    });
    const key = cfg?.apiKey?.trim();
    return key && key.startsWith('sk-') ? key : null;
  } catch {
    return null;
  }
}

async function generateEmbedding(userId: string, text: string): Promise<number[]> {
  const clean = (text || '').trim();
  if (!clean) return [];
  const key = await getUserOpenAiKey(userId);
  if (!key) return [];
  try {
    const openai = new OpenAI({ apiKey: key });
    const r = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: clean.slice(0, 8000),
    });
    return r.data?.[0]?.embedding ?? [];
  } catch {
    return [];
  }
}

function embedSource(title: string, keywords: string[], content: string): string {
  return `${title}\n${(keywords ?? []).join(' ')}\n${content}`;
}

export type KnowledgeBlockData = {
  title: string;
  keywords: string[];
  content: string;
  category?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function listKnowledgeBlocks(userId: string) {
  return db.knowledgeBlock.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createKnowledgeBlock(userId: string, data: KnowledgeBlockData) {
  const embedding = await generateEmbedding(
    userId,
    embedSource(data.title, data.keywords, data.content),
  );
  const block = await db.knowledgeBlock.create({
    data: { userId, ...data, embedding },
  });
  revalidatePath('/my-data');
  return block;
}

export async function updateKnowledgeBlock(
  id: string,
  userId: string,
  data: Partial<KnowledgeBlockData>,
) {
  // Si cambió el texto, regenera el embedding (con el contenido fusionado).
  let embedding: number[] | undefined;
  if (data.title !== undefined || data.content !== undefined || data.keywords !== undefined) {
    const current = await db.knowledgeBlock.findFirst({
      where: { id, userId },
      select: { title: true, content: true, keywords: true },
    });
    if (current) {
      embedding = await generateEmbedding(
        userId,
        embedSource(
          data.title ?? current.title,
          data.keywords ?? current.keywords,
          data.content ?? current.content,
        ),
      );
    }
  }
  const block = await db.knowledgeBlock.update({
    where: { id, userId },
    data: { ...data, ...(embedding ? { embedding } : {}) },
  });
  revalidatePath('/my-data');
  return block;
}

export async function deleteKnowledgeBlock(id: string, userId: string) {
  await db.knowledgeBlock.delete({ where: { id, userId } });
  revalidatePath('/my-data');
}

export async function toggleKnowledgeBlock(id: string, userId: string, isActive: boolean) {
  const block = await db.knowledgeBlock.update({
    where: { id, userId },
    data: { isActive },
  });
  revalidatePath('/my-data');
  return block;
}

export async function getKnowledgeBlockCounts(userId: string) {
  const [total, active] = await Promise.all([
    db.knowledgeBlock.count({ where: { userId } }),
    db.knowledgeBlock.count({ where: { userId, isActive: true } }),
  ]);
  return { total, active, inactive: total - active };
}

export async function deleteAllKnowledgeBlocks(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.knowledgeBlock.deleteMany({ where: { userId } });
    revalidatePath('/my-data');
    return { success: true, message: `${result.count} bloque(s) eliminados correctamente.` };
  } catch {
    return { success: false, message: 'Error al eliminar los bloques.' };
  }
}

export async function deleteInactiveKnowledgeBlocks(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.knowledgeBlock.deleteMany({ where: { userId, isActive: false } });
    revalidatePath('/my-data');
    return { success: true, message: `${result.count} bloque(s) inactivos eliminados.` };
  } catch {
    return { success: false, message: 'Error al eliminar los bloques inactivos.' };
  }
}

export async function activateAllKnowledgeBlocks(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.knowledgeBlock.updateMany({ where: { userId, isActive: false }, data: { isActive: true } });
    revalidatePath('/my-data');
    return { success: true, message: `${result.count} bloque(s) activados correctamente.` };
  } catch {
    return { success: false, message: 'Error al activar los bloques.' };
  }
}

export async function deactivateAllKnowledgeBlocks(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.knowledgeBlock.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
    revalidatePath('/my-data');
    return { success: true, message: `${result.count} bloque(s) desactivados correctamente.` };
  } catch {
    return { success: false, message: 'Error al desactivar los bloques.' };
  }
}

export async function autoSplitAndImport(
  userId: string,
  rawText: string,
  separator?: string,
): Promise<{ created: number; blocks: { title: string; keywords: string[] }[] }> {
  const sections = splitIntoSections(rawText, separator);

  if (sections.length === 0) return { created: 0, blocks: [] };

  const data = await Promise.all(
    sections.map(async (s, i) => ({
      userId,
      title: s.title,
      keywords: s.keywords,
      content: s.content,
      sortOrder: i,
      embedding: await generateEmbedding(userId, embedSource(s.title, s.keywords, s.content)),
    })),
  );
  const blocks = await db.knowledgeBlock.createMany({ data });

  revalidatePath('/my-data');

  return {
    created: blocks.count,
    blocks: sections.map((s) => ({ title: s.title, keywords: s.keywords })),
  };
}

type ParsedSection = { title: string; keywords: string[]; content: string };

function splitIntoSections(rawText: string, separator?: string): ParsedSection[] {
  let chunks: string[] = [];

  if (separator && separator !== 'auto') {
    chunks = rawText.split(separator).filter((c) => c.trim().length > 0);
  } else {
    // Detección automática: ### encabezados, ---, líneas vacías dobles
    if (/^###\s/m.test(rawText)) {
      chunks = rawText.split(/(?=^###\s)/m).filter((c) => c.trim().length > 0);
    } else if (/^---+$/m.test(rawText)) {
      chunks = rawText.split(/^---+$/m).filter((c) => c.trim().length > 0);
    } else if (/\n\n\n/.test(rawText)) {
      chunks = rawText.split(/\n\n\n+/).filter((c) => c.trim().length > 0);
    } else if (/\n\n/.test(rawText)) {
      chunks = rawText.split(/\n\n+/).filter((c) => c.trim().length > 10);
    } else {
      chunks = [rawText];
    }
  }

  return chunks.map((chunk) => parseChunk(chunk.trim()));
}

function parseChunk(chunk: string): ParsedSection {
  const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
  const rawTitle = lines[0]?.replace(/^#+\s*/, '').trim() ?? 'Bloque sin título';
  const title = rawTitle.length > 120 ? rawTitle.slice(0, 120) : rawTitle;
  const content = chunk;
  const keywords = extractKeywords(title, content);
  return { title, keywords, content };
}

function extractKeywords(title: string, content: string): string[] {
  const stopWords = new Set([
    'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'es', 'se',
    'que', 'con', 'del', 'por', 'para', 'su', 'al', 'lo', 'como', 'más',
    'o', 'pero', 'si', 'no', 'le', 'me', 'mi', 'te', 'tu', 'yo', 'él', 'i',
    'the', 'and', 'or', 'of', 'to', 'in', 'a', 'is', 'it', 'for',
  ]);

  const words = (title + ' ' + content)
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  // Frecuencia
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;

  // Palabras del título tienen más peso
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  for (const w of titleWords) freq[w] = (freq[w] ?? 0) + 5;

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  return sorted;
}
