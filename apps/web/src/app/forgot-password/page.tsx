"use client";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthCard } from "@/components/auth-card";
import { FieldError } from "@/components/field-error";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      await authClient.requestPasswordReset(
        { email: value.email, redirectTo: "/reset-password" },
        {
          // Better Auth answers identically for unknown addresses; showing the
          // same confirmation keeps the page from disclosing who has an account.
          onSuccess: () => setSent(true),
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({ email: z.email("Invalid email address") }),
    },
  });

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="If an account exists for that address, a reset link is on its way."
        footer={
          <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        }
      >
        <p className="text-muted-foreground text-sm">
          The link expires in an hour and can only be used once.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email Address</Label>
              <Input
                id="forgot-email"
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="email@yourcompany.com"
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
              {isSubmitting ? "Sending..." : "Send reset link"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthCard>
  );
}
