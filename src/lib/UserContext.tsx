"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface SessionUser {
  id: string;
  username: string;
  namaLengkap: string;
  role: "admin" | "operator";
  unitKerjaId?: string;
  isActive: boolean;
}

interface UserContextValue {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
  isLoading: true,
});

const STORAGE_KEY = "sianjab_user";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync session across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          if (e.newValue) {
            setUserState(JSON.parse(e.newValue));
          } else {
            setUserState(null);
          }
        } catch {
          setUserState(null);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUserState(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
    setIsLoading(false);
  }, []);

  const setUser = useCallback((u: SessionUser | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      localStorage.setItem("sianjab_last_activity", Date.now().toString());
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("sianjab_last_activity");
    }
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("sianjab_last_activity");
    // Remove cookie
    document.cookie = "sianjab_token=; Max-Age=0; path=/";
  }, []);

  // Idle timeout detector (5 minutes)
  useEffect(() => {
    if (!user) return;

    const IDLE_LIMIT = 5 * 60 * 1000; // 5 minutes
    const CHECK_INTERVAL = 10000; // 10 seconds
    const THROTTLE_TIME = 10000; // 10 seconds

    let lastWriteTime = Date.now();
    localStorage.setItem("sianjab_last_activity", lastWriteTime.toString());

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastWriteTime > THROTTLE_TIME) {
        lastWriteTime = now;
        localStorage.setItem("sianjab_last_activity", now.toString());
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    const interval = setInterval(() => {
      const storedTime = localStorage.getItem("sianjab_last_activity");
      const lastActivity = storedTime ? parseInt(storedTime, 10) : Date.now();

      if (Date.now() - lastActivity >= IDLE_LIMIT) {
        logout();
      }
    }, CHECK_INTERVAL);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
    };
  }, [user, logout]);

  return (
    <UserContext.Provider value={{ user, setUser, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
