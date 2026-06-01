import { create } from "zustand";

interface TaskStore {
  pendingCount: number;
  setPendingCount: (n: number) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  pendingCount: 0,
  setPendingCount: (n) => set({ pendingCount: n }),
}));
