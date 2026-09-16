"use client";

import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export function LoginView({
  next,
  initialSignUp = false,
}: {
  next: string | null;
  initialSignUp?: boolean;
}) {
  // Sign in is the default: most visitors to /login already have an account.
  // The public pages override it for someone who has just decided to try it.
  const [showSignIn, setShowSignIn] = useState(!initialSignUp);

  return showSignIn ? (
    <SignInForm next={next} onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm next={next} onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
