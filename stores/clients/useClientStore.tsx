import { create } from 'zustand';

interface ClientState {
    setEnable: (state: boolean) => void;
    isEnable: boolean;
}

export const useClientStore = create<ClientState>((set) => ({
    setEnable: (state) => set({isEnable: state}),
    isEnable: false
}));
