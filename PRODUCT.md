# Onirix

## Product definition

**Onirix is a private AI workspace that turns company documents into answers, analysis, and interactive charts that people can verify at the source.**

The product is built for organizations that want the usefulness of generative AI without giving up control of their knowledge, model provider, deployment, or internal access rules.

> **Ask your company. See the evidence.**

Onirix is not a generic chatbot and not a low-level AI development platform. It is the trusted interface between a team and the knowledge the team already owns.

---

## The distinctive capability

Most enterprise AI tools make one of two compromises: they are easy to use but opaque, or private but difficult to operate. Onirix is designed around a different combination:

1. **An answer is never a dead end.** Company-specific claims carry inline citations. A reader can open the exact supporting passage beside the answer and, when available, return to the original document.
2. **Analysis stays connected to evidence.** Onirix can turn numbers found in company files into interactive charts. Each plotted series can cite the document it came from, and the reader can inspect or copy the underlying data instead of trusting a static image.
3. **The organization chooses the intelligence.** A workspace can connect OpenAI, Anthropic, Google, xAI, and self-hosted Ollama models, enable more than one provider, and choose its default. Onirix uses credentials supplied by that workspace.
4. **Permissions are part of retrieval.** Organization, team, and private visibility are applied before content reaches the model. An administrator does not silently become a universal reader of restricted team knowledge.
5. **Private can mean local.** The full application stack is self-hostable, and Ollama allows a deployment to answer and embed without sending document content to an external model API.

That combination is the center of the product:

> **Private company intelligence with evidence built into every answer and every visual.**

---

## The problem

Useful company knowledge is scattered across policies, reports, spreadsheets, technical documents, and individual teams. Finding an answer usually means knowing where to look, opening several files, and deciding which version to trust.

Generic AI can summarize text, but it often cannot show which internal evidence supports an answer. It may also force an organization into one model vendor or flatten access controls once content is indexed.

Onirix gives the organization one place to ask, search, analyze, and verify—without separating convenience from control.

---

## The product experience

### 1. Bring your own AI

During setup, the workspace owner connects a model provider and selects the models the organization wants to use. Additional providers can be connected later, and the default chat model can be changed without rebuilding the application.

For maximum control, an organization can point Onirix at a self-hosted Ollama endpoint. Chat and embedding providers can also be selected separately when needed.

### 2. Add company knowledge

Users can upload common business documents. Onirix stores the original, extracts its text, preserves useful page or sheet anchors, divides it into meaningful sections, creates embeddings, and indexes it in the background.

Supported uploaded content currently includes:

- PDF
- Word (`.docx`)
- Excel (`.xlsx` and `.xls`)
- CSV
- Markdown
- HTML
- plain text and other `text/*` formats
- JSON

Uploads are limited to 50 MB per file. PowerPoint, images, and third-party source connectors are not part of the current upload pipeline.

### 3. Ask in natural language

Onirix searches with both semantic similarity and exact keywords, reranks results for relevance and freshness, and gives the model a bounded set of the strongest passages. Follow-up questions are rewritten into standalone search queries so a phrase such as “what about contractors?” keeps the context of the conversation.

The answer streams into the conversation as it is generated. If the browser refreshes or the network drops, a saved conversation can reconnect to the active stream and continue from the same answer.

### 4. Inspect the evidence

Inline citation markers open a side-by-side source panel containing the cited passage, document title, source type, update date, and original link when one exists. Only sources actually cited in the answer are saved as citations.

Cited passages are snapshotted with the conversation, keeping a historical answer auditable even after its source is reindexed or changed.

### 5. Turn internal data into a visual answer

When company knowledge contains comparable values, trends, or parts of a whole, Onirix can render a bar, line, area, pie, or scatter chart directly inside the answer.

The chart is generated as validated data rather than executable code or an image. This makes it possible to:

- trace chart series back to cited documents;
- reveal the same values as a table;
- copy the underlying data;
- show targets or thresholds as reference lines; and
- keep visuals consistent without executing model-written code against private data.

Spreadsheet headers are preserved across indexed chunks, helping the model retain the meaning of rows and columns when it analyzes larger sheets.

---

## Trust and control

### Evidence-native answers

Onirix instructs the model to prefer company sources for company questions, distinguish sourced facts from inference or general knowledge, acknowledge missing evidence, and surface disagreements between documents rather than quietly selecting one.

### Permission-aware knowledge

Every document belongs to an organization and has one of three audiences:

- **Organization:** available to everyone in the workspace.
- **Teams:** available only to selected teams and the uploader.
- **Private:** available only to the uploader.

The same rule is enforced in document metadata queries and in the OpenSearch retrieval filter. Content that a principal cannot retrieve is not provided to the model.

### Roles for administration, teams for knowledge access

Owner, admin, and member roles control administrative actions. Custom roles can grant specific abilities such as managing members, teams, sources, knowledge, roles, or models. Document access is separate: it follows the user’s team and document visibility rather than assuming that every administrator may read everything.

### Tenant isolation

Organizations are explicit tenant boundaries across documents, search, chats, and membership. Conversations are private to their author in the current product.

### Deployment and model control

Onirix ships as a self-hostable Docker stack using PostgreSQL, OpenSearch, Redis, and S3-compatible object storage. Organizations control the infrastructure and provider credentials used by their workspace. A fully local model path is available through Ollama.

---

## Available product capabilities

### Chat and analysis

- source-grounded conversational answers;
- inline, inspectable citations;
- interactive, cited charts inside answers;
- automatic conversation titles;
- saved conversation history with rename and delete;
- resumable answer streams after refresh or connection loss;
- file upload from chat;
- explicit handling of absent or conflicting evidence.

### Search and knowledge

- hybrid vector and keyword retrieval for answers;
- fast keyword search for finding documents directly;
- recency-aware reranking;
- one best passage per document in the final context, increasing source diversity;
- background extraction, chunking, embedding, and indexing;
- document indexing status, progress, failures, and manual retry;
- page-level PDF anchors and sheet-level spreadsheet anchors;
- logical knowledge collections that group documents by subject without changing their access rules.

### Administration

- organization onboarding;
- email/password, magic-link, and optional Google sign-in;
- email verification and password reset;
- member invitations;
- teams;
- built-in and custom roles;
- organization, team, or private document visibility;
- multiple model-provider connections and a selectable default model;
- light and dark appearance settings.

### Operations

- Docker-based self-hosting;
- PostgreSQL for relational metadata;
- OpenSearch for the hybrid knowledge index;
- Redis for indexing jobs and resumable chat streams;
- MinIO or compatible S3 storage for originals;
- recoverable in-flight indexing jobs after a worker restart.

---

## High-value use cases

### Policy and operations

Ask: “What is our international remote-work policy, and which exceptions require approval?”

Onirix answers from the organization’s policy documents and exposes the exact passages behind the response.

### Spreadsheet analysis

Ask: “Show quarterly attainment by account executive and mark the 85% target.”

Onirix can read uploaded spreadsheet data, produce an interactive chart with a target line, and attach source citations to the plotted series.

### Engineering knowledge

Ask: “How does authentication work, and where are organization permissions enforced?”

Onirix retrieves across technical documents and presents the answer with evidence rather than forcing the reader to search each file manually.

### Cross-document comparison

Ask: “Compare the renewal terms in these agreements and call out conflicts.”

Onirix brings together the most relevant documents, cites each claim, and explicitly surfaces disagreement in the source material.

---

## Ideal customer profile

Onirix is best suited to organizations that:

- have valuable internal knowledge spread across many documents;
- need answers that employees can verify, not merely plausible prose;
- handle team-restricted or sensitive material;
- want freedom to choose cloud or locally hosted AI models;
- prefer self-hosted infrastructure or a clear path to data residency; and
- need reports and spreadsheet data turned into understandable, traceable analysis.

Likely early teams include operations, HR, legal, engineering, sales enablement, research, and leadership.

---

## Product boundaries and roadmap

The current product is centered on uploaded files, grounded chat, search, administration, and model choice. The following ideas remain product direction and must not be presented as shipping flyer claims:

- Google Drive, SharePoint, OneDrive, Notion, Slack, Confluence, GitHub, and website connectors;
- scheduled or continuous connector synchronization;
- configurable specialist agents;
- agent actions in external business systems;
- shared conversations and generated reports;
- temporary, conversation-only file attachments;
- PowerPoint and image extraction;
- a production-ready mobile client; and
- managed cloud or dedicated-hosting commercial offerings.

The intended progression remains:

**Know → Answer → Analyze → Assist → Act**

Onirix should expand only while preserving its core promise: knowledge stays controlled, access follows the user, and outputs remain connected to evidence.

---

## Flyer messaging kit

### Primary headline

> **Ask your company. See the evidence.**

### Primary subhead

> Onirix turns private company documents into cited answers and interactive, source-backed charts—using the AI models and infrastructure your organization chooses.

### Alternate headlines

- **Your company knowledge, ready to answer.**
- **Private AI. Verifiable answers.**
- **From internal documents to decisions you can defend.**
- **Answers and charts that lead back to the source.**
- **One private AI workspace. Your knowledge. Your models. Your control.**

### Three proof points

- **Verify every answer.** Open the exact passage behind a claim and return to the original source.
- **See the story in your data.** Turn spreadsheets and reports into interactive charts with citations attached to the numbers.
- **Keep control.** Self-host the stack, choose from leading model providers, or run locally with Ollama.

### Short product description

> Onirix is a private AI workspace for organizational knowledge. Upload company documents, ask questions naturally, and receive concise answers grounded in the sources your team is allowed to access. Inspect cited passages, visualize internal data, and choose the cloud or self-hosted AI models that fit your organization.

### One-sentence description

> Onirix gives every organization a private, permission-aware AI that answers from company knowledge and shows the evidence behind its words and charts.

### Call to action

> **Turn company knowledge into answers your team can trust.**

### Recommended flyer hierarchy

1. Lead with “Ask your company. See the evidence.”
2. Show an answer with inline citation chips and the cited-passage panel.
3. Show an interactive chart generated from an uploaded spreadsheet.
4. Support the visual with three short claims: permission-aware, model-independent, self-hostable.
5. End with the call to action, not with infrastructure details.

### Claims to avoid until the roadmap ships

Do not say “connect all your apps,” “continuous synchronization,” “AI agents that take action,” “mobile access,” or “supports every file type.” Use precise language: uploaded business documents, grounded answers, cited charts, permission-aware access, provider choice, and self-hosting.

---

## Product north star

A person should be able to ask the organization a question, understand the answer, inspect the evidence, and act with confidence—without needing to know where the information was stored or which model produced the prose.

> **Onirix makes company knowledge useful without making it opaque or giving up control.**
