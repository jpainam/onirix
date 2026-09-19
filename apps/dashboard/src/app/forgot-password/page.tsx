"use client";

import { Button } from "@onirix/ui/components/button";
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
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";


import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";
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
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Check your email
            </CardTitle>
            <CardDescription>If an account exists for that address, a reset link is on its way.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-muted-foreground text-sm">
              The link expires in an hour and can only be used once.
            </p>
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
            Reset your password
          </CardTitle>
          <CardDescription>We'll email you a link to choose a new one.</CardDescription>
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
