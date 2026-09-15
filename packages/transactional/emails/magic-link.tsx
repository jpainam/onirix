/**
 * Preview entrypoint for the react-email dev server (`pnpm email:dev`).
 *
 * The dev server renders the default export of every file in this directory,
 * so each auth email gets its own entry driven by `PreviewProps`.
 */
import { AuthLinkEmail } from "../src/auth-link";

export default function Preview({ url }: { url: string }) {
  return <AuthLinkEmail kind="magic-link" url={url} />;
}

Preview.PreviewProps = {
  url: "https://onirix.local/api/auth/preview?token=preview-token-0123456789",
} satisfies { url: string };
