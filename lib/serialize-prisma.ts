// lib/serialize-prisma.ts
export function serializePrisma<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => {
      // Prisma Decimal (tiene toNumber)
      if (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") {
        return (v as { toNumber: () => number }).toNumber();
      }
      return v;
    })
  );
}
