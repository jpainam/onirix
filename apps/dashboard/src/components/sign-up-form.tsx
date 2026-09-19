"use client";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Field, FieldGroup, FieldSeparator } from "@onirix/ui/components/field";

import { AuthLayout } from "@/components/auth-layout";
import { FieldError } from "@/components/field-error";
import { GoogleButton } from "@/components/google-button";
import { isCancelled, useDesktopHandoff } from "@/hooks/use-desktop-handoff";
import { authClient, resolveNext } from "@/lib/auth-client";

export default function SignUpForm({
  onSwitchToSignIn,
  next,
}: {
  onSwitchToSignIn: () => void;
  /** Where to go once signed in, when an invitation link asked for one. */
  next?: string | null;
}) {
  const destination = resolveNext(next);
  const [verifySentTo, setVerifySentTo] = useState<string | null>(null);

  // The verification link opens in the default browser, never in the desktop
  // window, so in the app the browser hands the session back instead.
  const handoff = useDesktopHandoff();

  const waitForBrowser = async (verifier: string) => {
    if (!handoff) return;
    try {
      await handoff.wait(verifier);
      // A full load: the session cookie is new and every server component
      // should read it from scratch.
      window.location.assign(destination);
    } catch (error) {
      if (isCancelled(error)) return;
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      const attempt = handoff ? await handoff.begin(destination) : null;
      await authClient.signUp.email(
        {
          name: value.name,
          email: value.email,
          password: value.password,
          callbackURL: attempt?.callbackURL ?? destination,
        },
        {
          // Verification is required, so sign-up never yields a session. The
          // next step is the inbox, not the app.
          onSuccess: () => {
            setVerifySentTo(value.email);
            if (attempt) void waitForBrowser(attempt.verifier);
          },
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
      <AuthLayout
        title="Verify your email"
        description={`We sent a confirmation link to ${verifySentTo}.`}
      >
        <p className="text-muted-foreground text-sm">
          Click the link in that email to finish setting up your account. The
          link expires in an hour.
          {handoff
            ? " It opens in your browser; confirm there and this app signs in by itself."
            : ""}
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            handoff?.cancel();
            onSwitchToSignIn();
          }}
        >
          Back to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Chat with your organization's knowledge."
    >
      <GoogleButton label="Sign up with Google" next={next} />

      <FieldSeparator>or continue with email</FieldSeparator>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="flex flex-col gap-5"
      >
        <FieldGroup>
          <form.Field name="name">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
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
              </Field>
            )}
          </form.Field>

          <form.Field name="email">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <Label htmlFor="signup-email">Email address</Label>
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
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
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
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create account"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>

      <div className="text-muted-foreground text-sm">
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Sign in
          </button>
        </>
      </div>
    </AuthLayout>
  );
}
