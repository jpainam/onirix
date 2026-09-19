import { LoginView } from "./login-view";

/**
 * Sign in, optionally on the way to somewhere else.
 *
 * `next` carries the handoff from an invitation link, so an invitee who is not
 * signed in yet returns to the invitation instead of landing in an empty
 * workspace. Read here rather than with `useSearchParams` so the toggle below
 * stays a plain client component with no Suspense boundary around it.
 *
 * `mode=signup` opens the sign-up form first, for the "Get started" links on
 * the public pages; anything else lands on sign in.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const { next, mode } = await searchParams;
  return <LoginView next={next ?? null} initialSignUp={mode === "signup"} />;
}
