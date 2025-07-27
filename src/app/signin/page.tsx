"use client";

import { useRouter } from 'next/navigation';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import AuthAPI from '@/features/supabase/auth/auth.service';

// 1. Zod schema
const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignInFormData = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();
  // 2. React Hook Form setup
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  // 3. Submit handler
  const onSubmit = async (data: SignInFormData) => {
    console.log("Submitted data:", data);
    // auth logic goes here
     try {
      await AuthAPI.signin(data.email, data.password);
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message || 'Sign in failed.');
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Sign in to <span className="text-primary">Vault Reader</span>
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm text-muted-foreground mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm text-muted-foreground mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
          </div>

          {/* Remember + Forgot */}
          <div className="flex justify-between items-center text-sm">
            <label className="inline-flex items-center text-muted-foreground">
              <input type="checkbox" className="mr-2 h-4 w-4 rounded border-border text-accent focus:ring-accent" />
              Remember me
            </label>
            <Link href="#" className="text-muted-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button className="w-full mt-4 py-6 text-lg">Sign In</Button>
        </form>

        {/* Signup redirect */}
        <p className="mt-6 text-sm text-center text-muted-foreground">
          Don’t have an account?{" "}
          <Link href="/signup" className="text-foreground underline font-medium">
            Sign Up
          </Link>
        </p>
      </div>
    </main>
  );
}
