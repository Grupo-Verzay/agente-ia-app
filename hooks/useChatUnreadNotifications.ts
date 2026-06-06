"use client";

// El conteo de chats sin leer es estado cliente puro (pendingUnreadJids en chat-sidebar).
// Este hook existe solo como punto de entrada del store — la actualización real
// ocurre en chat-sidebar.tsx via useEffect cuando filterCounts.unread cambia.
export function useChatUnreadNotifications() {}
