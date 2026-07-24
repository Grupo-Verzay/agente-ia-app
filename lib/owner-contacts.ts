// Personas con "Modo Dueño" (dueño, socio, administrador…) que pueden dar
// órdenes a la IA por WhatsApp. Para NO tocar la base de datos, la lista se
// guarda como JSON dentro del campo existente `User.ownerModePhone`.
//
// Formatos aceptados al leer (retrocompatibles):
//   - JSON:   [{"name":"Juan","phone":"573001234567","role":"Dueño"}]
//   - Legado: "573001234567"  o  "573001234567,573002223344"  (solo números)

export type OwnerPerson = { name: string; phone: string; role: string };

export function parseOwnerPeople(raw?: string | null): OwnerPerson[] {
  const s = (raw ?? "").trim();
  if (!s) return [];

  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr
          .map((o) => ({
            name: String(o?.name ?? "").trim() || "Dueño",
            phone: String(o?.phone ?? "").replace(/\D/g, ""),
            role: String(o?.role ?? "").trim() || "Dueño",
          }))
          .filter((o) => o.phone.length >= 7);
      }
    } catch {
      /* cae al parseo de legado */
    }
  }

  // Legado: uno o varios números separados por coma.
  return s
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter((p) => p.length >= 7)
    .map((phone) => ({ name: "Dueño", phone, role: "Dueño" }));
}

export function serializeOwnerPeople(people: OwnerPerson[]): string | null {
  const seen = new Set<string>();
  const clean: OwnerPerson[] = [];
  for (const p of people) {
    const phone = (p.phone ?? "").replace(/\D/g, "");
    if (phone.length < 7 || seen.has(phone)) continue;
    seen.add(phone);
    clean.push({
      name: (p.name ?? "").trim() || "Dueño",
      phone,
      role: (p.role ?? "").trim() || "Dueño",
    });
  }
  return clean.length ? JSON.stringify(clean) : null;
}
