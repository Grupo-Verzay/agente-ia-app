// Diagnóstico: muestra todos los títulos actuales en la base de datos
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prompts = await prisma.agentPrompt.findMany({
    select: { id: true, sections: true, userId: true },
  });

  let found = 0;

  for (const prompt of prompts) {
    const s = prompt.sections;
    if (!s || typeof s !== 'object') continue;

    const titles = [];

    const sectionKeys = ['training', 'faq', 'products', 'extras', 'management'];
    for (const key of sectionKeys) {
      for (const arr of [s[key]?.steps ?? [], s[key]?.items ?? []]) {
        for (const item of arr) {
          if (typeof item.title === 'string' && item.title !== '')
            titles.push({ sección: key, title: item.title });
        }
      }
    }

    const nonUppercase = titles.filter(t => t.title !== t.title.toUpperCase());

    if (nonUppercase.length > 0) {
      console.log(`\nPrompt ${prompt.id} (userId: ${prompt.userId}):`);
      for (const t of nonUppercase) {
        console.log(`  [${t.sección}] "${t.title}"`);
      }
      found += nonUppercase.length;
    }
  }

  if (found === 0) {
    console.log('✅ Todos los títulos ya están en MAYÚSCULAS en la base de datos.');
  } else {
    console.log(`\n⚠️ Total de títulos aún en minúscula/mixto: ${found}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
