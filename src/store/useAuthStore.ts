// src/store/useAuthStore.ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { User } from "@supabase/supabase-js";
import { auth } from "@/lib/db";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await auth.signIn(email, password);
          if (error) throw error;
          set({ user: data.user, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
          throw err;
        }
      },

      signup: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await auth.signUp(email, password);
          if (error) throw error;
          set({ user: data.user, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          const { error } = await auth.signOut();
          if (error) throw error;
          set({ user: null, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
          throw err;
        }
      },

      refreshUser: async () => {
        set({ isLoading: true });
        try {
          const { data } = await auth.getUser();
          set({ user: data.user, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage", // key in localStorage
      partialize: (state) => ({
        // only persist the user field
        user: state.user,
      }),
    }
  )
);
