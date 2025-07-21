"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthAPI from '../auth.service';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      if (!AuthAPI.isAuthenticated()) {
        router.replace('/signin');
        return;
      }

      try {
        await AuthAPI.getCurrentUser();
        setLoading(false);
      } catch (err) {
        console.error("Failed to get user:", err);
        router.replace('/signin');
      }
    };

    checkAuth();
  }, [router]);

  if (loading) return null;
  return <>{children}</>;
}
