// Muestra TODOS los títulos actuales en la BD sin filtrar
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const prompts = await prisma.agentPrompt.findMany({
    select: { id: true, userId: true, sections: true },
  });

  for (const prompt of prompts) {
    const s = prompt.sections;
    if (!s || typeof s !== 'object') continue;

    const allTitles = [];

    for (const step of s.training?.steps ?? []) {
      if (step.title !== undefined) allTitles.push(`  [training] "${step.title}"`);
    }
    for (const item of s.faq?.items ?? []) {
      if (item.title !== undefined) allTitles.push(`  [faq]      "${item.title}"`);
    }
    for (const item of s.products?.items ?? []) {
      if (item.title !== undefined) allTitles.push(`  [products] "${item.title}"`);
    }
    for (const item of s.extras?.items ?? []) {
      if (item.title !== undefined) allTitles.push(`  [extras]   "${item.title}"`);
    }

    if (allTitles.length > 0) {
      console.log(`\nPrompt ${prompt.id} (userId: ${prompt.userId}):`);
      allTitles.forEach(t => console.log(t));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
