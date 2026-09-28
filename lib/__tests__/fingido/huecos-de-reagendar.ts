/** Los huecos libres, fingidos: se anota de qué cuenta y con qué duración se pidieron. */
const w = globalThis as unknown as Record<string, any>;
export async function getAvailableSlots(userId: string, ymd: string, duracion: number, zona: string) {
    (w.__huecosPedidos ??= []).push({ userId, ymd, duracion, zona });
    const a = new Date(`${ymd}T14:00:00.000Z`);
    const b = new Date(`${ymd}T17:00:00.000Z`);
    return {
        success: true,
        data: [a, b].map((d) => ({ startTime: d.toISOString(), endTime: new Date(d.getTime() + duracion * 60_000).toISOString() })),
    };
}
