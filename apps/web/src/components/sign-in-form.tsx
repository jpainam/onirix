"use client";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthCard, AuthDivider } from "@/components/auth-card";
import { FieldError } from "@/components/field-error";
import { GoogleButton } from "@/components/google-button";
import { isCancelled, useDesktopHandoff } from "@/hooks/use-desktop-handoff";
import { authClient, resolveNext } from "@/lib/auth-client";

export default function SignInForm({
  onSwitchToSignUp,
  next,
}: {
  onSwitchToSignUp: () => void;
  /** Where to go once signed in, when an invitation link asked for one. */
  next?: string | null;
}) {
  const router = useRouter();
  const destination = resolveNext(next);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);

  // A magic link opens in the default browser, never in the desktop window,
  // so in the app the link signs the browser in and hands the session back.
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

  const magicLinkForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const attempt = handoff ? await handoff.begin() : null;
      await authClient.signIn.magicLink(
        { email: value.email, callbackURL: attempt?.callbackURL ?? destination },
        {
          onSuccess: () => {
            setMagicLinkSentTo(value.email);
            if (attempt) void waitForBrowser(attempt.verifier);
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({ email: z.email("Email is required") }),
    },
  });

  const passwordForm = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => router.push(destination),
          onError: (error) => {
            // A sign-in blocked on verification is expected rather than broken,
            // so point at the inbox instead of surfacing a raw auth error.
            if (error.error.code === "EMAIL_NOT_VERIFIED") {
              toast.error("Verify your email first. We just sent you a new link.");
              return;
            }
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (magicLinkSentTo) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a sign-in link to ${magicLinkSentTo}.`}>
        <p className="text-muted-foreground text-sm">
          The link expires in 5 minutes and can only be used once.
          {handoff
            ? " It opens in your browser; confirm there and this app signs in by itself."
            : ""}
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            handoff?.cancel();
            setMagicLinkSentTo(null);
          }}
        >
          Use a different email
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome to Onirix"
      subtitle="Chat with your organization&apos;s knowledge."
      footer={
        <>
          New to Onirix?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Create an Account
          </button>
        </>
      }
    >
      <GoogleButton label="Continue with Google" next={next} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          magicLinkForm.handleSubmit();
        }}
        className="space-y-3"
      >
        <magicLinkForm.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="magic-link-email">Magic Link</Label>
              <Input
                id="magic-link-email"
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
        </magicLinkForm.Field>

        <magicLinkForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </magicLinkForm.Subscribe>
      </form>

      <AuthDivider />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          passwordForm.handleSubmit();
        }}
        className="space-y-4"
      >
        <passwordForm.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email Address</Label>
              <Input
                id="signin-email"
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
        </passwordForm.Field>

        <passwordForm.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="signin-password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground text-sm underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="signin-password"
                name={field.name}
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                aria-invalid={field.state.meta.errors.length > 0}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </passwordForm.Field>

        <passwordForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </passwordForm.Subscribe>
      </form>
    </AuthCard>
  );
}
