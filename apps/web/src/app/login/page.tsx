import { LoginView } from "./login-view";

/**
 * Sign in, optionally on the way to somewhere else.
 *
 * `next` carries the handoff from an invitation link, so an invitee who is not
 * signed in yet returns to the invitation instead of landing in an empty
 * workspace. Read here rather than with `useSearchParams` so the toggle below
 * stays a plain client component with no Suspense boundary around it.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginView next={next ?? null} />;
}
