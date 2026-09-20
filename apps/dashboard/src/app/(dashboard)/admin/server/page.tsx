import { Page, PageHeader } from "@/components/page";

import { ServerView } from "./server-view";

export default function ServerPage() {
  return (
    <Page>
      <PageHeader title="Server" />
      <ServerView />
    </Page>
  );
}
