'use server';

import { db } from "@/lib/db"; // Adjust the path if necessary
import { GuideUrl } from "@prisma/client";

// Get all guides (global, no filter by userId)
export async function getAllGuides() {
  try {
    const guides = await db.guideUrl.findMany({
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: guides };
  } catch (error) {
    return { success: false, message: error.message || "Error retrieving guides." };
  }
}

// Get a single guide by its ID
export async function getGuideById(id: string) {
  try {
    const guide = await db.guideUrl.findUnique({
      where: { id },
    });

    if (!guide) {
      return { success: false, message: "Guide not found." };
    }

    return { success: true, data: guide };
  } catch (error) {
    return { success: false, message: error.message || "Error retrieving the guide." };
  }
}

// Create a new guide
interface CreateGuideInput {
  userId: string;
  path: string;
  title: string;
  description?: string;
  url: string;
}

export async function createGuide(data: CreateGuideInput) {
  try {
    const newGuide = await db.guideUrl.create({
      data,
    });

    return { success: true, data: newGuide };
  } catch (error) {
    return { success: false, message: error.message || "Error creating the guide." };
  }
}

// Update an existing guide by ID
interface UpdateGuideInput {
  id: string;
  title?: string;
  description?: string;
  url?: string;
  path?: string;
}

export async function updateGuide(data: UpdateGuideInput) {
  try {
    const updatedGuide = await db.guideUrl.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        url: data.url,
        path: data.path,
      },
    });

    return { success: true, data: updatedGuide };
  } catch (error) {
    return { success: false, message: error.message || "Error updating the guide." };
  }
}

// Delete a guide by ID
export async function deleteGuide(id: string) {
  try {
    await db.guideUrl.delete({
      where: { id },
    });

    return { success: true, message: "Guide successfully deleted." };
  } catch (error) {
    return { success: false, message: error.message || "Error deleting the guide." };
  }
}

/**
 * Los tutoriales de la pantalla en la que se está, para el botón "Ver
 * tutoriales" de la barra.
 *
 * Se buscaba por dirección exacta, y un tutorial del Panel —guardado como
 * `/panel`— no salía en ninguna de sus pantallas, porque el navegador está en
 * `/panel/analytics`, `/panel/clientes`, etc. Quedaba grabado y no aparecía por
 * ningún lado.
 *
 * Ahora también valen los tutoriales de las secciones que contienen a la
 * pantalla actual: en `/panel/analytics` salen los de `/panel/analytics` y los
 * de `/panel`. La raíz `/` se queda fuera a propósito —si contara, su tutorial
 * saldría en toda la App—, salvo cuando se está justo en ella.
 */
export async function getGuidesForPath(path: string) {
  const actual = (path || '/').replace(/\/+$/, '');
  if (!actual) return db.guideUrl.findMany({ where: { path: '/' } });

  const segmentos = actual.split('/').filter(Boolean);
  const candidatos = segmentos.map((_, i) => '/' + segmentos.slice(0, i + 1).join('/'));

  // Las pestañas de un módulo no cuelgan de su dirección: Informes es una
  // pestaña del Panel pero vive en /crm/dashboard, así que por dirección no hay
  // manera de saber que pertenece ahí. Se pregunta a qué módulo pertenece la
  // pantalla actual y se añade la dirección de ese módulo, para que el tutorial
  // del Panel salga en todas sus pestañas.
  const variantes = new Set<string>();
  for (const c of candidatos) {
    variantes.add(c);
    // Las pestañas del panel se guardan como /admin/... y se sirven en /panel/...
    variantes.add(c.replace('/panel/', '/admin/'));
  }

  try {
    const items = await db.moduleItem.findMany({
      where: {
        OR: [
          { url: { in: Array.from(variantes) } },
          { customUrl: { in: Array.from(variantes) } },
        ],
      },
      select: { module: { select: { route: true } } },
    });
    for (const item of items) {
      const ruta = item.module?.route?.trim();
      // Solo direcciones de verdad. Los módulos que agrupan submenús comparten
      // "#container": darlo por bueno haría que un tutorial guardado ahí saliera
      // en las pantallas de los siete módulos que lo comparten a la vez.
      if (!ruta?.startsWith('/') || ruta === '/' || candidatos.includes(ruta)) continue;
      candidatos.push(ruta);
    }
  } catch {
    // Sin módulos seguimos con las direcciones de la propia pantalla.
  }

  const guides = await db.guideUrl.findMany({
    where: { path: { in: candidatos } },
  });

  // El más específico primero: si hay uno de la pantalla exacta, ese encabeza.
  return guides.sort((a, b) => b.path.length - a.path.length);
}
