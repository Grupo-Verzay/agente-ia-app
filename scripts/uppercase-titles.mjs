// Script de migración: convierte todos los títulos existentes a MAYÚSCULAS
// Uso: node scripts/uppercase-titles.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function uppercaseArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((item) => ({
    ...item,
    title: typeof item.title === 'string' ? item.title.toUpperCase() : item.title,
  }));
}

function uppercaseTitlesInSections(sections) {
  if (!sections || typeof sections !== 'object') return sections;

  const result = { ...sections };

  // Todas las secciones usan "steps" como array de ítems
  const sectionKeys = ['training', 'faq', 'products', 'extras', 'management'];
  for (const key of sectionKeys) {
    if (result[key]?.steps && Array.isArray(result[key].steps)) {
      result[key] = { ...result[key], steps: uppercaseArray(result[key].steps) };
    }
    // Por compatibilidad, también maneja "items" si existiera
    if (result[key]?.items && Array.isArray(result[key].items)) {
      result[key] = { ...result[key], items: uppercaseArray(result[key].items) };
    }
  }

  return result;
}

async function main() {
  const prompts = await prisma.agentPrompt.findMany({
    select: { id: true, sections: true },
  });

  console.log(`Total de prompts a procesar: ${prompts.length}`);

  let updated = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    const original = JSON.stringify(prompt.sections);
    const newSections = uppercaseTitlesInSections(prompt.sections);
    const modified = JSON.stringify(newSections);

    if (original === modified) {
      skipped++;
      continue;
    }

    await prisma.agentPrompt.update({
      where: { id: prompt.id },
      data: { sections: newSections },
    });

    updated++;
    console.log(`✓ Actualizado prompt ${prompt.id}`);
  }

  console.log(`\nResultado: ${updated} actualizados, ${skipped} sin cambios.`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
