import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { auth } from "@/lib/db";

// Cache expiration time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

export const useAuthInitialization = () => {
  const { cachedUserData, setUser, setProfile, setCachedUserData } = useAuthStore();

  useEffect(() => {
    const initializeAuth = async () => {
      // Check if we have cached user data
      if (cachedUserData) {
        const now = Date.now();
        const isExpired = now - cachedUserData.timestamp > CACHE_EXPIRY_MS;
        
        if (!isExpired) {
          // Try to get current user from Supabase
          try {
            const { data: { user }, error } = await auth.getUser();
            
            if (!error && user && user.id === cachedUserData.userId) {
              // User is still authenticated, set the user data
              setUser(user);
              
              // Optionally fetch fresh profile data
              // This could be done in background
            } else {
              // User is no longer authenticated, clear cache
              setCachedUserData(null);
            }
          } catch (err) {
            console.error("Error checking auth status:", err);
            setCachedUserData(null);
          }
        } else {
          // Cache expired, clear it
          setCachedUserData(null);
        }
      }
    };

    initializeAuth();
  }, [cachedUserData, setUser, setCachedUserData]);
};
