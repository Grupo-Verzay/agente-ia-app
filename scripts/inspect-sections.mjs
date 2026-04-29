import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const prompt = await prisma.agentPrompt.findUnique({
    where: { id: '1473c60d-cbfc-4bc4-af9b-8fc1f37a6fd3' },
    select: { sections: true },
  });

  const s = prompt.sections;
  console.log('\n=== FAQ ===');
  console.log(JSON.stringify(s.faq, null, 2));
  console.log('\n=== PRODUCTS ===');
  console.log(JSON.stringify(s.products, null, 2));
  console.log('\n=== EXTRAS ===');
  console.log(JSON.stringify(s.extras, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
