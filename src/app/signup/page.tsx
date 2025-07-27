"use client";

import { useRouter } from 'next/navigation';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import AuthAPI from '@/features/supabase/auth/auth.service';

// 1. Zod Schema
const signUpSchema = z
  .object({
    firstName: z.string().min(2, "First name is required"),
    lastName: z.string().min(2, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormData) => {
    console.log("Signup data:", data);
    // Send to backend or API here
     try {
    const fullName = `${data.firstName} ${data.lastName}`;
    await AuthAPI.signup(data.email, data.password, fullName);
    router.push('/dashboard');
  } catch (err: any) {
    if (err) {
      alert(err.message || 'Sign up failed');
    } 
  }
  };

  return (
    <main className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card text-card-foreground border border-border rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Create your <span className="text-primary">Vault Reader</span> account
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm text-muted-foreground mb-1">
              First Name
            </label>
            <input
              id="firstName"
              {...register("firstName")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.firstName && <p className="text-sm text-destructive mt-1">{errors.firstName.message}</p>}
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm text-muted-foreground mb-1">
              Last Name
            </label>
            <input
              id="lastName"
              {...register("lastName")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.lastName && <p className="text-sm text-destructive mt-1">{errors.lastName.message}</p>}
          </div>

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
              autoComplete="new-password"
              {...register("password")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-muted-foreground mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
          </div>

          {/* Submit */}
          <Button className="w-full mt-4 py-6 text-lg">Sign Up</Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <Link href="/signin" className="underline text-foreground">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}
