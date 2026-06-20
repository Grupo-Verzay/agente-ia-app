"use client";

import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";

export function ChatSidebarCollapser() {
  const { setOpen, isMobile } = useSidebar();

  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, []);

  return null;
}
