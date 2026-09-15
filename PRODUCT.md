# Onirix

## Product Overview

Onirix is a private AI workspace that gives organizations a secure AI assistant capable of understanding and working with their internal knowledge.

Organizations connect their existing sources of information—documents, cloud storage, collaboration tools, internal systems, and other business applications—and Onirix turns that information into a searchable, conversational knowledge layer.

Employees can then ask questions naturally, find information across the organization, analyze documents, conduct research, and use AI agents that understand the context of their company.

Onirix is designed around a simple principle:

> **Your company's knowledge should power your AI without becoming someone else's data.**

The product is designed to be self-hostable, allowing organizations to maintain control over their data and AI environment.

---

# Product Vision

Most organizations already have enormous amounts of useful knowledge.

The problem is that it is fragmented across:

* documents
* shared drives
* internal wikis
* collaboration tools
* project management systems
* source-code repositories
* business applications
* databases
* employee knowledge

Finding an answer often requires knowing where the information lives before searching for it.

Onirix creates a single intelligent interface over this fragmented knowledge.

Instead of asking:

> "Where was that document?"

employees should be able to ask:

> "What is our policy for employees working internationally?"

Instead of manually searching several systems:

> "What did we decide about the Acme renewal?"

Instead of reading multiple documents:

> "Compare the requirements in these three contracts and identify the major differences."

Onirix finds the relevant company information, reasons over it, and provides an answer grounded in the organization's actual sources.

---

# Positioning

Onirix is not simply a chatbot.

It is:

> **A private AI workspace for organizational knowledge.**

The product combines company knowledge, AI search, conversational assistance, agents, and connected business systems into one environment.

The user should not need to understand concepts such as embeddings, vector databases, retrieval pipelines, model inference, or RAG.

From the user's perspective, the experience is simply:

**Connect your company → Onirix understands your knowledge → Ask anything.**

---

# Core Product Principles

## 1. Private by Design

Organizations should remain in control of their information.

Onirix is designed so that companies can operate their own AI environment without requiring their internal documents to become part of a third-party AI provider's knowledge.

Privacy should be a core product characteristic rather than an enterprise add-on.

---

## 2. Company Knowledge First

When answering company-specific questions, Onirix should prioritize the organization's connected information over generic AI knowledge.

Answers should clearly distinguish between:

* information found in company sources
* information inferred by the AI
* general knowledge

Whenever possible, company-specific answers should include citations that allow users to inspect the original source.

---

## 3. Search Should Feel Like Conversation

Users should not have to construct perfect search queries.

They should be able to ask:

> "What is our parental leave policy?"

> "Find the presentation where we discussed expansion into Europe."

> "What were the major concerns raised about Project Atlas?"

> "Summarize everything we know about this customer."

Onirix determines how to search the organization's knowledge and can perform additional searches when the first results are insufficient.

---

## 4. Permissions Must Follow the User

Connecting organizational knowledge must not make all organizational knowledge available to everyone.

If a user cannot access information in its original source, Onirix should not expose that information through AI.

The product must treat permissions as part of knowledge, not as an afterthought.

---

## 5. Simple Before Powerful

Onirix should avoid becoming an overwhelming AI administration platform.

The primary experience should remain understandable to someone who has never built an AI application.

Advanced functionality can exist without dominating the interface.

---

# Core Navigation

The initial Onirix product should revolve around five primary areas:

1. Chat
2. Knowledge
3. Sources
4. Agents
5. Team

Administrative configuration is available through Settings.

---

# Chat

Chat is the primary Onirix experience.

Users interact with their organization's AI through a familiar conversational interface.

The default assistant can answer questions using organizational knowledge while also performing general reasoning when appropriate.

Users can:

* ask questions
* search company knowledge
* analyze information
* summarize documents
* compare documents
* upload files during conversations
* reference existing company knowledge
* continue previous conversations
* inspect citations
* open original sources
* interact with configured agents

A conversation may involve multiple searches and sources before Onirix produces an answer.

The complexity of that process should remain invisible to the user.

---

# Sources

Sources represent the systems from which Onirix learns organizational knowledge.

Organizations can connect supported services and choose what information Onirix should index.

Example sources may include:

* Google Drive
* Microsoft SharePoint
* OneDrive
* Notion
* Slack
* Confluence
* GitHub
* websites
* local file uploads
* internal documentation systems
* business applications

Additional integrations can be introduced over time.

Each source should display useful operational information such as:

* connection status
* last synchronization
* synchronization progress
* number of indexed items
* errors requiring attention

Example:

> **SharePoint**
>
> Connected
> 12,438 documents indexed
> Last synchronized 8 minutes ago

Synchronization happens continuously or on an appropriate schedule so that organizational knowledge remains current.

---

# Knowledge

Knowledge provides visibility into what Onirix knows.

Users with appropriate permissions can browse indexed organizational information without needing to understand how the underlying search system works.

Knowledge can be organized into logical collections such as:

* Company
* Human Resources
* Engineering
* Sales
* Legal
* Finance
* Customer Support
* Product
* Research

Collections may contain information originating from multiple sources.

For example:

**Engineering Knowledge**

could contain:

* GitHub repositories
* architecture documents
* technical specifications
* engineering Notion pages
* selected Slack channels

Knowledge therefore represents a logical organizational layer rather than simply a folder structure.

---

# Documents

Users should be able to inspect individual documents known to Onirix.

A document page may show:

* title
* source
* location
* owner
* last updated date
* synchronization status
* access information
* document preview
* related knowledge collection

Users can open the original source whenever available.

This makes AI answers auditable rather than turning organizational information into an opaque knowledge store.

---

# Citations

Company-specific answers should provide citations whenever supporting evidence exists.

Example:

> Employees may work internationally for up to 30 consecutive days with manager approval. Longer periods require approval from HR and Legal.
>
> **Sources**
>
> * Remote Work Policy
> * International Employment Guidelines

Selecting a citation should reveal the relevant passage and provide access to the original document.

Citations are a central part of establishing trust in Onirix.

---

# Agents

Agents are specialized AI assistants configured for particular roles or tasks.

The default Onirix assistant has broad access to the knowledge available to the current user.

Organizations can additionally create focused agents.

Examples include:

### HR Assistant

Knowledge:

* employee handbook
* benefits documentation
* leave policies
* HR procedures

Example questions:

> "How many weeks of parental leave do we provide?"

> "What is the reimbursement policy for home-office equipment?"

---

### Sales Assistant

Knowledge:

* sales documentation
* product information
* pricing
* customer material
* sales processes

Example questions:

> "What are the major differences between our Enterprise and Business plans?"

> "Prepare talking points for a customer concerned about data residency."

---

### Engineering Assistant

Knowledge:

* technical documentation
* architecture documents
* repositories
* engineering discussions

Example questions:

> "How does our authentication system work?"

> "Where is invoice generation implemented?"

---

# Agent Capabilities

An agent can have:

* a name
* description
* instructions
* selected knowledge
* available tools
* permitted actions
* access restrictions

Agents may initially focus primarily on knowledge retrieval.

Over time they can interact with business systems and perform controlled actions.

---

# Actions

Onirix should eventually allow agents to do more than retrieve information.

Depending on permissions and connected systems, agents may perform actions such as:

* create a support ticket
* create a project task
* retrieve customer information
* inspect an account
* prepare an email
* update a business record
* generate a report
* query an internal system

Sensitive or destructive actions should require explicit user confirmation when appropriate.

The progression is:

**Ask → Understand → Research → Act**

rather than limiting Onirix to question answering.

---

# Research

Some questions cannot be answered with a single search.

Onirix should be capable of investigating a question across multiple pieces of organizational knowledge.

For example:

> "What are the biggest recurring complaints from enterprise customers this quarter?"

Onirix may need to examine information from several relevant sources, compare findings, identify patterns, and produce a consolidated answer.

The user should receive both the conclusion and the evidence supporting it.

---

# File Uploads

Users can upload files directly into Onirix.

Supported document types should cover common business formats such as:

* PDF
* Word
* PowerPoint
* Excel
* CSV
* text
* Markdown
* HTML
* common image formats

Uploaded files can either:

* exist temporarily within a conversation, or
* become persistent organizational knowledge

depending on the user's intent and permissions.

---

# Team

Organizations can invite employees into their Onirix workspace.

Users belong to an organization and receive roles appropriate to their responsibilities.

Initial roles can include:

### Owner

Full control over the organization.

### Admin

Manages users, sources, knowledge, agents, and organization configuration.

### Member

Uses Onirix according to assigned permissions.

Additional permission models can be introduced as enterprise requirements evolve.

---

# Groups

Organizations should eventually be able to organize users into groups.

Examples:

* Engineering
* Sales
* Human Resources
* Finance
* Leadership

Groups can simplify access management for knowledge and agents.

For example:

**HR Knowledge**

Accessible to:

* HR group
* Executive group

This allows Onirix to mirror how organizations already structure information access.

---

# Onboarding

Onboarding should minimize the time between creating an organization and experiencing useful AI.

The ideal flow is:

### Step 1 — Create Organization

The user provides basic company information.

### Step 2 — Connect Knowledge

Onirix presents supported sources.

For example:

**Connect your company knowledge**

[ Google Drive ]

[ SharePoint ]

[ OneDrive ]

[ Notion ]

[ Upload Files ]

The user can connect one or several sources.

### Step 3 — Build Company Knowledge

Onirix begins processing connected information.

The experience should communicate progress clearly:

> **Onirix is learning your organization**
>
> 8,421 of 10,230 documents processed

Users should not need to understand indexing or AI infrastructure.

### Step 4 — Start Asking

Once sufficient knowledge is available:

> **Your company AI is ready.**
>
> Ask Onirix anything about your organization.

The user is taken directly into Chat.

---

# Search

Onirix should also support direct organizational search for situations where the user wants information rather than a generated answer.

Users should be able to search for:

* documents
* people-related information they are authorized to access
* projects
* policies
* conversations
* topics
* customers
* technical information

Search results should clearly indicate their original source.

---

# Conversation History

Users can return to previous conversations.

Conversation history should support:

* titles
* timestamps
* search
* favorites
* deletion
* sharing where permitted

Users may also start temporary conversations that are not retained in normal history.

---

# Sharing

Users should eventually be able to share useful AI outputs within their organization.

Examples include:

* conversations
* research results
* generated reports
* agents
* knowledge collections

Sharing must always respect underlying source permissions.

Sharing an answer must never become a mechanism for bypassing access controls.

---

# Privacy

Privacy is a defining characteristic of Onirix.

Organizations should have clear visibility into:

* where their data is stored
* which AI models can access it
* which sources are connected
* which users have access
* what information is indexed
* how information can be removed

Onirix should not use customer knowledge to train models shared with other customers.

Customer organizations must remain isolated from one another.

---

# Deployment

Onirix is designed to support organizations that require control over where their AI environment operates.

The product should ultimately support multiple deployment models.

### Onirix Cloud

The simplest managed experience.

Onirix operates the environment while maintaining isolation between organizations.

### Dedicated Environment

An isolated environment dedicated to a single organization.

Designed for companies requiring stronger infrastructure separation.

### Customer Infrastructure

Onirix operates within infrastructure controlled by the customer.

This option is intended for organizations with strict privacy, security, regulatory, or data-residency requirements.

Regardless of deployment model, the product experience should remain consistent.

---

# Administration

Administrators need visibility into the state of their Onirix environment.

Administration should eventually cover:

* users
* groups
* permissions
* connected sources
* synchronization
* knowledge
* agents
* models
* usage
* security
* audit history

The administration experience should remain separate from the everyday employee experience whenever possible.

Most employees should simply open Onirix and ask questions.

---

# Settings

Settings can include:

### Organization

* organization name
* logo
* branding
* default preferences

### Members

* users
* invitations
* roles
* groups

### AI

* available models
* default model
* model permissions

### Privacy

* data retention
* conversation retention
* indexing controls

### Security

* authentication
* enterprise identity
* session policies
* access policies

### Usage

* AI usage
* storage
* connected sources
* organization activity

---

# Product Scope

Onirix should intentionally avoid trying to become a complete AI development platform.

The product is not primarily:

* a model training platform
* a prompt engineering IDE
* a generic workflow builder
* an ML experimentation platform
* a vector database interface
* a low-level RAG development framework
* an AI infrastructure dashboard

Those capabilities may exist internally or through integrations, but they should not define the user experience.

The core product remains:

> **Connect your organization's knowledge and give your team a private AI that understands it.**

---

# Initial Product Scope

The first production version should prioritize:

* organization creation
* user authentication
* team membership
* document uploads
* connected knowledge sources
* automatic synchronization
* organizational knowledge search
* conversational AI
* source-grounded answers
* citations
* conversation history
* knowledge collections
* basic agents
* basic roles and permissions
* self-hosted deployment

The product should be useful before advanced automation or agent actions are introduced.

---

# Future Product Direction

Once the knowledge foundation is strong, Onirix can expand from an AI that **knows the company** into an AI that can **work within the company**.

The progression is:

### Phase 1 — Know

Connect and understand organizational knowledge.

### Phase 2 — Answer

Provide reliable answers with citations.

### Phase 3 — Research

Investigate complex questions across multiple organizational sources.

### Phase 4 — Assist

Provide specialized agents for teams and business functions.

### Phase 5 — Act

Allow authorized agents to interact with business systems and perform controlled actions.

This progression keeps the product grounded in a valuable initial use case while creating a path toward more capable enterprise AI agents.

---

# Product North Star

A successful Onirix deployment should make employees feel that they can ask their organization a question directly.

They should not need to know:

* which drive contains a document
* which Slack channel discussed a decision
* which wiki contains a policy
* which repository contains an implementation
* which business system contains a record

They ask Onirix.

Onirix determines where the relevant information exists, retrieves what the user is authorized to access, reasons over it, and returns a useful answer with evidence.

The long-term goal is simple:

> **Every organization should be able to have its own private AI—one that understands its knowledge, respects its permissions, and can eventually work across its systems.**
