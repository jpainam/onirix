"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
import { Spinner } from "@onirix/ui/components/spinner";


import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";
import { AFTER_SIGN_IN, authClient } from "@/lib/auth-client";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "wrong-account"; signedInAs: string }
  | { status: "ready"; organizationName: string }
  | { status: "error"; message: string };

/**
 * Better Auth refuses `get-invitation` for anyone but the invited address, and
 * names the reason in the error body's `code`. Matching on it is what separates
 * "sign in as someone else" from the dead ends — an expired or cancelled
 * invitation is not something switching accounts can fix.
 */
const WRONG_RECIPIENT = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";

export function AcceptInvitationView({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [accepting, setAccepting] = useState(false);

  const loginHref: Route = `/login?next=${encodeURIComponent(`/accept-invitation/${invitationId}`)}`;

  useEffect(() => {
    if (sessionPending) return;

    // Signing in has to come first: an invitation is accepted *by* an account,
    // and which account it is decides whether the address matches.
    if (!session?.user) {
      setState({ status: "signed-out" });
      return;
    }

    const signedInAs = session.user.email;
    let cancelled = false;
    void authClient.organization
      .getInvitation({ query: { id: invitationId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error?.code === WRONG_RECIPIENT) {
          setState({ status: "wrong-account", signedInAs });
          return;
        }
        if (error || !data) {
          setState({
            status: "error",
            message:
              error?.message ??
              "This invitation is no longer valid. Ask for a new one.",
          });
          return;
        }
        // Reaching here means the server already matched the invited address
        // against this session, so there is nothing left for us to re-check.
        setState({ status: "ready", organizationName: data.organizationName });
      });

    return () => {
      cancelled = true;
    };
  }, [invitationId, session?.user, sessionPending]);

  async function accept() {
    setAccepting(true);
    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setState({ status: "error", message: error.message ?? "Could not accept." });
      setAccepting(false);
      return;
    }

    // Land in the workspace just joined rather than whichever one the session
    // was last pointed at.
    router.push(AFTER_SIGN_IN);
    router.refresh();
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Checking your invitation
            </CardTitle>
            <CardDescription>One moment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "signed-out") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Sign in to accept
            </CardTitle>
            <CardDescription>Invitations are tied to an email address, so we need to know who you are first.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Button className="w-full" onClick={() => router.push(loginHref)}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "wrong-account") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Wrong account
            </CardTitle>
            {/* The server withholds the invited address from everyone but the recipient. */}
          <CardDescription>{`This invitation was sent to a different email address. You are signed in as ${state.signedInAs}. Sign out and sign in with the invited address to accept it.`}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Button
              className="w-full"
              onClick={() =>
                void authClient.signOut({
                  // Sign-out has to land before the redirect, or the invitation
                  // page reloads against the session we are trying to shed.
                  fetchOptions: { onSuccess: () => router.push(loginHref) },
                })
              }
            >
              Sign out and switch account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-104">
          <CardHeader>
            <div className="mb-3">
              <OnirixWordmark />
            </div>
            <CardTitle role="heading" aria-level={1}>
              Invitation unavailable
            </CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
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
            {`Join ${state.organizationName}`}
          </CardTitle>
          <CardDescription>{`You will see what ${state.organizationName} and your teams have shared with you.`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Button className="w-full" disabled={accepting} onClick={() => void accept()}>
            {accepting ? <Spinner /> : null}
            Accept invitation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
