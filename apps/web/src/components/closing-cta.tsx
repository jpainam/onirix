// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
import { ArrowRightIcon } from "@onirix/ui/lib/icons";

import { CtaLink } from "@/components/cta-link";
import { ProviderMarkRow } from "@/components/provider-mark-row";
import { Eyebrow, Heading, Lead, Section } from "@/components/section";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";

/** The page's last word, on ink: the headline again, larger, and one ask. */
export function ClosingCta() {
  return (
    <Section id="start" labelledBy="start-heading" className="dark bg-tint-01 text-foreground">
      <div className="flex flex-col items-center text-center">
        <ProviderMarkRow centered />
        <Eyebrow className="mt-10">Private AI workspace</Eyebrow>
        <Heading id="start-heading" className="mt-4 max-w-3xl text-3xl sm:text-5xl">
          Ask your company. See the evidence.
        </Heading>
        <Lead className="mt-6">Create a workspace, connect a provider, upload a folder.</Lead>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <CtaLink href={SIGN_UP_URL}>
            Create a workspace
            <ArrowRightIcon className="size-4" aria-hidden />
          </CtaLink>
          <CtaLink href={SIGN_IN_URL} variant="secondary">
            Sign in
          </CtaLink>
        </div>
      </div>
    </Section>
  );
}
