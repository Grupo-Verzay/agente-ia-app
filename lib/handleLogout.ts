"use client";

import { logoutAction } from "@/actions/auth-action";
import { signOut } from "next-auth/react";

export async function handleLogout() {
  try {
    // 1) limpia cookies server (impersonación, etc.)
    await logoutAction();

    // 2) limpia cookies/session de next-auth (sin redirect)
    await signOut({ redirect: false });

    // 3) HARD reload para matar caches y estado SPA
    window.location.href = "/login";
  } catch {
    // fallback duro
    window.location.href = "/login";
  }
}
