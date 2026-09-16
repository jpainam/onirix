"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** A Better Auth client call, which reports failure in its result rather than by throwing. */
export type AuthAction = () => Promise<{ error?: { message?: string } | null }>;

/**
 * Runs a Better Auth organization mutation, reports it, and refreshes the views
 * that read what it changed.
 *
 * Every write on the admin surfaces goes through Better Auth from the client so
 * its own permission checks, limits and owner protection apply; the only thing
 * left for the caller is the toast and the invalidation, which is this.
 */
export function useAuthAction() {
  const queryClient = useQueryClient();

  return async function run(action: AuthAction, ok: string) {
    const result = await action();
    if (result.error) {
      toast.error(result.error.message ?? "Something went wrong.");
      return false;
    }
    toast.success(ok);
    // Members, teams and invitations all move together here: a role change or a
    // new team shows up in more than one list, so the page refetches as a whole.
    void queryClient.invalidateQueries();
    return true;
  };
}
