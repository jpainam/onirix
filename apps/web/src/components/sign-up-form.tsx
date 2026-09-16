"use client";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthCard, AuthDivider } from "@/components/auth-card";
import { FieldError } from "@/components/field-error";
import { GoogleButton } from "@/components/google-button";
import { AFTER_SIGN_IN, authClient } from "@/lib/auth-client";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const [verifySentTo, setVerifySentTo] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          name: value.name,
          email: value.email,
          password: value.password,
          callbackURL: AFTER_SIGN_IN,
        },
        {
          // Verification is required, so sign-up never yields a session. The
          // next step is the inbox, not the app.
          onSuccess: () => setVerifySentTo(value.email),
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (verifySentTo) {
    return (
      <AuthCard
        title="Verify your email"
        subtitle={`We sent a confirmation link to ${verifySentTo}.`}
      >
        <p className="text-muted-foreground text-sm">
          Click the link in that email to finish setting up your account. The link expires in
          an hour.
        </p>
        <Button variant="outline" className="w-full" onClick={onSwitchToSignIn}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create an Account"
      subtitle="Chat with your organization&apos;s knowledge."
      footer={
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Sign In
          </button>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />

      <AuthDivider />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="signup-name">Name</Label>
              <Input
                id="signup-name"
                name={field.name}
                autoComplete="name"
                placeholder="Ada Lovelace"
                aria-invalid={field.state.meta.errors.length > 0}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email Address</Label>
              <Input
                id="signup-email"
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

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
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

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create Account"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthCard>
  );
}
