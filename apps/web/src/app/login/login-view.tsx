"use client";

import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export function LoginView({ next }: { next: string | null }) {
  // Sign in is the default: most visitors to /login already have an account.
  const [showSignIn, setShowSignIn] = useState(true);

  return showSignIn ? (
    <SignInForm next={next} onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm next={next} onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
