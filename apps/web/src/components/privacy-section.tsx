// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
import Link from "next/link";
import { ArrowRightIcon, BoxesIcon, ServerIcon, UsersIcon, WifiOffIcon } from "@onirix/ui/lib/icons";

import { Eyebrow, HairlineCell, HairlineGrid, Heading, Lead, Section } from "@/components/section";

/**
 * The reason the product exists, so it sits right under the hero on the one
 * ink band in the top half of the page. Four answers to the four questions a
 * company asks before it lets an AI near its files. Each is stated on the
 * security page in full; this is the short form.
 */
export function PrivacySection() {
  return (
    <Section id="privacy" labelledBy="privacy-heading" className="dark bg-tint-01 text-foreground">
      <div className="flex max-w-3xl flex-col gap-4">
        <Eyebrow>Privacy</Eyebrow>
        <Heading id="privacy-heading" className="text-3xl sm:text-4xl">
          Your data stays where you put it.
        </Heading>
        <Lead>
          You decide where the data lives, which model reads it, and who can
          see each document.
        </Lead>
      </div>

      <HairlineGrid className="mt-12">
        <HairlineCell icon={ServerIcon} title="Where the data lives" aside="self-hosted">
          The whole stack runs in Docker on servers you operate. Originals, the
          search index, and conversations stay in your own databases and object
          store.
        </HairlineCell>
        <HairlineCell icon={BoxesIcon} title="Which model reads it" aside="your keys">
          Chat and embedding calls go only to the provider you connect, under
          your own credentials. You can change it at any time.
        </HairlineCell>
        <HairlineCell icon={UsersIcon} title="Who sees which document" aside="org / team / private">
          Visibility is checked inside the search query, before anything
          reaches the model. An admin who is not on a team does not read that
          team&apos;s documents.
        </HairlineCell>
        <HairlineCell icon={WifiOffIcon} title="Fully local when it has to be" aside="Ollama">
          With Ollama for both chat and embeddings, a deployment answers
          questions without a single outbound request.
        </HairlineCell>
      </HairlineGrid>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Link
          href="/security"
          className="text-foreground inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          Read the security overview
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
        <Link
          href="/security#permissions"
          className="text-ink-03 hover:text-foreground transition-colors"
        >
          How document permissions work
        </Link>
      </div>
    </Section>
  );
}
