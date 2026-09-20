import { Page, PageHeader } from "@/components/page";

import packageJson from "../../../../../package.json";

import { AboutView } from "./about-view";

export default function AboutPage() {
  return (
    <Page>
      <PageHeader title="About Onirix" />
      <AboutView version={packageJson.version} />
    </Page>
  );
}
