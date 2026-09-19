"use client";

import { Button, buttonVariants } from "@onirix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import z from "zod";


import { OnirixWordmark } from "@/components/onirix-mark";
import { FieldError } from "@/components/field-error";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Better Auth redirects here with `?token=` on success, or `?error=` when the
  // link is expired or already spent.
  const token = params.get("token");

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value }) => {
      if (!token) return;
      await authClient.resetPassword(
        { newPassword: value.password, token },
        {
          onSuccess: () => {
            toast.success("Password updated. Sign in with your new password.");
            router.push("/login");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z
        .object({
          password: z.string().min(8, "Password must be at least 8 characters"),
          confirm: z.string(),
        })
        .refine((v) => v.password === v.confirm, {
          message: "Passwords do not match",
          path: ["confirm"],
        }),
    },
  });

  if (!token) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Link expired
            </CardTitle>
            <CardDescription>This reset link is no longer valid.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Link href="/forgot-password" className={buttonVariants({ className: "w-full" })}>
              Request a new link
            </Link>
          </CardContent>
        </Card>
        <div className="text-muted-foreground text-sm">
          <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-104">
        <CardHeader>
          <div className="mb-3">
            <OnirixWordmark />
          </div>
          <CardTitle role="heading" aria-level={1}>
            Choose a new password
          </CardTitle>
          <CardDescription>Your old password stops working once you save.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    aria-invalid={field.state.meta.errors.length > 0}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field name="confirm">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat your new password"
                    aria-invalid={field.state.meta.errors.length > 0}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save password"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
