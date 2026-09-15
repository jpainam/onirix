"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";

import { AuthCard } from "@/components/auth-card";
import { AFTER_SIGN_IN, authClient } from "@/lib/auth-client";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "ready"; organizationName: string; email: string }
  | { status: "error"; message: string };

export function AcceptInvitationView({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (sessionPending) return;

    // Signing in has to come first: an invitation is accepted *by* an account,
    // and which account it is decides whether the address matches.
    if (!session?.user) {
      setState({ status: "signed-out" });
      return;
    }

    let cancelled = false;
    void authClient.organization
      .getInvitation({ query: { id: invitationId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({
            status: "error",
            message:
              error?.message ??
              "This invitation is no longer valid. Ask for a new one.",
          });
          return;
        }
        setState({
          status: "ready",
          organizationName: data.organizationName,
          email: data.email,
        });
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
        <Button
          className="w-full"
          onClick={() =>
            router.push(`/login?next=${encodeURIComponent(`/accept-invitation/${invitationId}`)}`)
          }
        >
          Sign in
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

  const matches = session?.user.email === state.email;

  return (
    <AuthCard
      title={`Join ${state.organizationName}`}
      subtitle={
        matches
          ? `You will see what ${state.organizationName} and your departments have shared with you.`
          : `This invitation was sent to ${state.email}, but you are signed in as ${session?.user.email}. Sign in with the invited address to accept it.`
      }
    >
      <Button
        className="w-full"
        disabled={!matches || accepting}
        onClick={() => void accept()}
      >
        {accepting ? <Spinner /> : null}
        Accept invitation
      </Button>
    </AuthCard>
  );
}
