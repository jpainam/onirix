# Onirix

**Onirix is a private AI workspace that turns company documents into answers and charts people can check against the source.**

> Ask your company. See the evidence.

## The problem

Company knowledge sits in policies, reports, spreadsheets, and team folders. Finding an answer means knowing where to look, opening several files, and guessing which version is current.

Generic AI summarizes text but usually cannot show which internal document backs a claim. It also tends to lock an organization into one model vendor and to flatten access rules once content is indexed.

## What makes it different

1. **Answers carry citations.** Company-specific claims link to the passage behind them, opened beside the answer, with a link to the original file when one exists.
2. **Charts stay tied to evidence.** Numbers found in company files become bar, line, area, pie, or scatter charts. Each series can cite its document, and the reader can open the table or copy the data.
3. **You pick the model.** Connect OpenAI, Anthropic, Google, xAI, or self-hosted Ollama, enable several at once, and set the default. Onirix uses your credentials.
4. **Permissions apply before retrieval.** Organization, team, and private visibility are enforced in the query, not after. An admin does not silently become a reader of every team's knowledge.
5. **Private can mean local.** The stack is self-hostable, and Ollama lets a deployment answer and embed without sending document text to an external API.

## How it works

**Connect a provider.** The workspace owner picks a provider and models during setup. More can be added later, and chat and embedding providers can differ.

**Upload documents.** Onirix keeps the original, extracts text, preserves page and sheet anchors, chunks it, embeds it, and indexes it in the background. Supported today: PDF, `.docx`, `.xlsx`, `.xls`, CSV, Markdown, HTML, JSON, and `text/*`. Limit is 50 MB per file. PowerPoint, images, and third-party connectors are not in the pipeline yet.

**Ask a question.** Retrieval combines semantic and keyword search, reranks for relevance and freshness, and passes a bounded set of the strongest passages to the model. Follow-ups are rewritten into standalone queries, so "what about contractors?" keeps its context. Answers stream, and a refreshed browser reconnects to the stream in progress.

**Check the sources.** Citation markers open a panel with the cited passage, title, source type, update date, and link. Only sources actually cited are stored, and passages are snapshotted with the conversation so an old answer stays auditable after reindexing.

**Chart the numbers.** Charts are generated as validated data, not as code or images, so nothing model-written executes against private data. Spreadsheet headers are preserved across chunks so rows and columns keep their meaning in large sheets.

## Trust and control

Every document belongs to an organization and is visible to the whole organization, to selected teams plus the uploader, or to the uploader alone. The same rule runs in the metadata query and in the OpenSearch filter.

Owner, admin, and member roles govern administrative actions, and custom roles can grant narrower abilities over members, teams, sources, knowledge, roles, or models. Document access is separate and follows teams and visibility.

Organizations are hard tenant boundaries across documents, search, chats, and membership. Conversations are private to their author.

The model is told to prefer company sources for company questions, separate sourced facts from inference, say when evidence is missing, and surface disagreement between documents instead of picking one quietly.

## What ships today

**Chat:** grounded answers, inspectable citations, cited charts, automatic titles, saved history with rename and delete, resumable streams, upload from chat.

**Knowledge:** hybrid retrieval, fast keyword document search, recency-aware reranking, one best passage per document for source diversity, background indexing with status, failures, and retry, PDF page and spreadsheet sheet anchors, collections that group documents without changing access.

**Administration:** onboarding, email/password, magic link, optional Google sign-in, verification and password reset, invitations, teams, built-in and custom roles, document visibility, multiple providers with a selectable default, light and dark themes.

**Operations:** Docker self-hosting on PostgreSQL, OpenSearch, Redis, and MinIO or another S3-compatible store, with indexing jobs that recover after a worker restart.

## Where it fits

- "What is our international remote-work policy, and which exceptions need approval?"
- "Show quarterly attainment by account executive and mark the 85% target."
- "How does authentication work, and where are organization permissions enforced?"
- "Compare the renewal terms in these agreements and call out conflicts."

Best for organizations with knowledge spread across many documents, team-restricted or sensitive material, a preference for self-hosting, and a need for answers employees can verify. Early teams tend to be operations, HR, legal, engineering, sales enablement, and research.

## Not yet shipped

Connectors for Drive, SharePoint, OneDrive, Notion, Slack, Confluence, GitHub, and websites. Scheduled sync. Specialist agents and actions in external systems. Shared conversations and generated reports. Conversation-only attachments. PowerPoint and image extraction. A production mobile client. Managed hosting.

Do not claim any of these. Precise language for the current product: uploaded business documents, grounded answers, cited charts, permission-aware access, provider choice, self-hosting.

Direction: **Know → Answer → Analyze → Assist → Act**, expanded only while knowledge stays controlled, access follows the user, and output stays connected to evidence.

## Messaging

**Headline:** Ask your company. See the evidence.

**Subhead:** Onirix turns private company documents into cited answers and interactive, source-backed charts, using the AI models and infrastructure your organization chooses.

**Proof points:**
- Verify every answer. Open the passage behind a claim and go to the original file.
- See the story in your data. Spreadsheets and reports become interactive charts with citations on the numbers.
- Keep control. Self-host the stack, choose a provider, or run locally with Ollama.

**Short description:** Onirix is a private AI workspace for company knowledge. Upload documents, ask questions, and get answers grounded in the sources your team is allowed to see. Inspect the cited passages, chart internal data, and run the cloud or self-hosted models that fit your organization.

**Call to action:** Turn company knowledge into answers your team can trust.

**Flyer order:** headline, an answer with citation chips and the passage panel, a chart built from an uploaded spreadsheet, three claims (permission-aware, model-independent, self-hostable), then the call to action. Infrastructure detail does not close the page.
