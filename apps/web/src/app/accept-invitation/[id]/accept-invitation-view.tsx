"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";

import { AuthCard } from "@/components/auth-card";
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
      <AuthCard title="Checking your invitation" subtitle="One moment.">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  if (state.status === "signed-out") {
    return (
      <AuthCard
        title="Sign in to accept"
        subtitle="Invitations are tied to an email address, so we need to know who you are first."
      >
        <Button className="w-full" onClick={() => router.push(loginHref)}>
          Sign in
        </Button>
      </AuthCard>
    );
  }

  if (state.status === "wrong-account") {
    return (
      <AuthCard
        title="Wrong account"
        // The invited address stays unsaid: the server withholds it from
        // everyone but the recipient, so repeating it here would tell whoever
        // holds the link who was invited.
        subtitle={`This invitation was sent to a different email address. You are signed in as ${state.signedInAs}. Sign out and sign in with the invited address to accept it.`}
      >
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
      </AuthCard>
    );
  }

  if (state.status === "error") {
    return (
      <AuthCard title="Invitation unavailable" subtitle={state.message}>
        <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${state.organizationName}`}
      subtitle={`You will see what ${state.organizationName} and your teams have shared with you.`}
    >
      <Button className="w-full" disabled={accepting} onClick={() => void accept()}>
        {accepting ? <Spinner /> : null}
        Accept invitation
      </Button>
    </AuthCard>
  );
}
