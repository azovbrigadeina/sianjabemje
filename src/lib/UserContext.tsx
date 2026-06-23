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
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    localStorage.removeItem(STORAGE_KEY);
    // Remove cookie
    document.cookie = "sianjab_token=; Max-Age=0; path=/";
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
