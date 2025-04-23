// src/store/useAuthStore.ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { User } from "@supabase/supabase-js";
import { auth } from "@/lib/db";
import { profiles, Profile } from "@/lib/db";
import { useOrgStore } from "./useOrgStore";
interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const { resetOrg } = useOrgStore.getState();
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user }),

      setProfile: (profile) => set({ profile }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await auth.signIn(email, password);
          if (error) throw error;

          // Fetch user profile after login
          if (data.user) {
            try {
              const { data: profileData, error: profileError } =
                await profiles.getByUserId(data.user.id);
              if (profileError) throw profileError;

              set({
                user: data.user,
                profile: profileData as Profile,
                isLoading: false,
              });
            } catch (profileErr) {
              // If profile fetch fails, still set the user
              set({
                user: data.user,
                profile: null,
                isLoading: false,
              });
            }
          } else {
            set({ user: data.user, isLoading: false });
          }
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
          throw err;
        }
      },

      signup: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await auth.signUp(email, password);
          if (error) throw error;

          set({
            user: data.user,
            profile: null, // Profile will be fetched on next login
            isLoading: false,
          });
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
          set({ user: null, profile: null, isLoading: false });
          resetOrg();
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

          // Also refresh profile if user exists
          if (data.user) {
            try {
              const { data: profileData, error: profileError } =
                await profiles.getByUserId(data.user.id);
              if (!profileError && profileData) {
                set({ profile: profileData as Profile });
              }
            } catch (profileErr) {
              // If profile fetch fails, keep the existing profile or set to null
              console.error("Error fetching profile:", profileErr);
            }
          }
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },

      refreshProfile: async () => {
        const { user } = get();
        if (!user) return;

        set({ isLoading: true });
        try {
          const { data: profileData, error: profileError } =
            await profiles.getByUserId(user.id);
          if (profileError) throw profileError;

          set({ profile: profileData as Profile, isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage", // key in localStorage
      partialize: (state) => ({
        // only persist the user and profile fields
        user: state.user,
        profile: state.profile,
      }),
    }
  )
);
