"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { BookVaultDexie } from "./schema";

let _db: BookVaultDexie | null = null;

export function openUserDb(userId: string): BookVaultDexie {
  if (_db) {
    _db.close();
  }
  _db = new BookVaultDexie(userId);
  return _db;
}

export function getDb(): BookVaultDexie {
  if (!_db) {
    throw new Error("DB not initialized — call openUserDb first");
  }
  return _db;
}

export function closeUserDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

interface UserDbContextValue {
  db: BookVaultDexie;
  userId: string;
}

const UserDbContext = createContext<UserDbContextValue | null>(null);

export function useDb(): BookVaultDexie {
  const ctx = useContext(UserDbContext);
  if (!ctx) {
    throw new Error("useDb must be used within a UserDbProvider");
  }
  return ctx.db;
}

export function useUserId(): string {
  const ctx = useContext(UserDbContext);
  if (!ctx) {
    throw new Error("useUserId must be used within a UserDbProvider");
  }
  return ctx.userId;
}

interface UserDbProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function UserDbProvider({ userId, children }: UserDbProviderProps) {
  const [db, setDb] = useState<BookVaultDexie>(() => openUserDb(userId));

  useEffect(() => {
    const newDb = openUserDb(userId);
    setDb(newDb);

    return () => {
      closeUserDb();
    };
  }, [userId]);

  return (
    <UserDbContext.Provider value={{ db, userId }}>
      {children}
    </UserDbContext.Provider>
  );
}
