import { create } from "zustand";

interface ChatUnreadStore {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
}

export const useChatUnreadStore = create<ChatUnreadStore>((set) => ({
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: n }),
}));
