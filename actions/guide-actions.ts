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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
    return { success: false, message: error.message || "Error deleting the guide." };
  }
}

export async function getGuidesForPath(path: string) {
  const guides = await db.guideUrl.findMany({
    where: { path },
  });

  return guides;
}
