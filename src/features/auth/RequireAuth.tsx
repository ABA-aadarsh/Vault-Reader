"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from './auth.service';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    console.log("Checking auth...");

    getCurrentUser()
      .then((user) => {
        console.log("User authenticated:", user);
        setLoading(false);
      })
      .catch((err) => {
        
        router.push('/signin');
      });
  }, [router]);

  if (loading) return <div>Loading...</div>;

  return <>{children}</>;
}
