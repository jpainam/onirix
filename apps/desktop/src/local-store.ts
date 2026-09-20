/**
 * Local chats: one JSON file per chat, plus an index the sidebar reads.
 *
 * They live under the app's data directory and nowhere else, which is the
 * whole promise of local mode. A chat is a few kilobytes of text, so files
 * are read and written whole and synchronously, like `settings.ts`.
 *
 * Every write goes to a temporary file that is then renamed over the real
 * one (see atomic-write.ts), so a crash or a power cut mid-write leaves the
 * old file intact rather than half of a new one. The index is a convenience, not
 * a source of truth: if it is missing or unreadable it is rebuilt from the
 * chat files.
 */
import { app } from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { writeJsonAtomic } from "./atomic-write";
import {
  type Chat,
  type ChatMessage,
  type ChatSummary,
  LIMITS,
  type MessageSource,
} from "./local-bridge";

/** Ids are ours (`randomUUID`), and they become file names, so nothing else passes. */
const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function localDir(): string {
  return join(app.getPath("userData"), "local");
}

function chatsDir(): string {
  return join(localDir(), "chats");
}

function indexFile(): string {
  return join(localDir(), "index.json");
}

function chatFile(id: string): string {
  return join(chatsDir(), `${id}.json`);
}

export function assertChatId(id: unknown): string {
  if (typeof id !== "string" || !CHAT_ID.test(id)) throw new Error("Unknown chat.");
  return id;
}

function isSource(value: unknown): value is MessageSource {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.index === "number" &&
    typeof source.documentId === "string" &&
    typeof source.title === "string" &&
    typeof source.passage === "string"
  );
}

function parseMessage(value: unknown): ChatMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const message = value as Record<string, unknown>;
  if (
    typeof message.id !== "string" ||
    (message.role !== "user" && message.role !== "assistant") ||
    typeof message.text !== "string" ||
    typeof message.createdAt !== "string"
  ) {
    return null;
  }
  const sources = Array.isArray(message.sources)
    ? message.sources.filter(isSource).map((source) => ({
        index: source.index,
        documentId: source.documentId,
        title: source.title,
        passage: source.passage,
        location: typeof source.location === "string" ? source.location : null,
      }))
    : [];
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    ...(sources.length > 0 ? { sources } : {}),
  };
}

/** A file on disk is input like any other: it may have been edited, or cut short. */
function parseChat(raw: string, id: string): Chat | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.id !== id ||
      typeof value.title !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string" ||
      !Array.isArray(value.messages)
    ) {
      return null;
    }
    return {
      id,
      title: value.title,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      messages: value.messages
        .map(parseMessage)
        .filter((message): message is ChatMessage => message !== null),
      // Absent in chats written before documents existed.
      documentIds: Array.isArray(value.documentIds)
        ? value.documentIds.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function summarize(chat: Chat): ChatSummary {
  return { id: chat.id, title: chat.title, updatedAt: chat.updatedAt };
}

function newestFirst(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

let index: ChatSummary[] | null = null;

function rebuildIndex(): ChatSummary[] {
  let names: string[];
  try {
    names = readdirSync(chatsDir());
  } catch {
    return [];
  }
  const found: ChatSummary[] = [];
  for (const name of names) {
    const id = name.replace(/\.json$/, "");
    if (!name.endsWith(".json") || !CHAT_ID.test(id)) continue;
    const chat = getChat(id);
    if (chat) found.push(summarize(chat));
  }
  return newestFirst(found);
}

function readIndex(): ChatSummary[] {
  if (index) return index;
  try {
    const stored = JSON.parse(readFileSync(indexFile(), "utf8")) as unknown;
    if (!Array.isArray(stored)) throw new Error("Not a list.");
    index = newestFirst(
      stored.filter(
        (entry): entry is ChatSummary =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as ChatSummary).id === "string" &&
          CHAT_ID.test((entry as ChatSummary).id) &&
          typeof (entry as ChatSummary).title === "string" &&
          typeof (entry as ChatSummary).updatedAt === "string",
      ),
    );
  } catch {
    index = rebuildIndex();
  }
  return index;
}

function writeIndex(next: ChatSummary[]): void {
  index = newestFirst(next);
  mkdirSync(localDir(), { recursive: true });
  writeJsonAtomic(indexFile(), index);
}

export function listChats(): ChatSummary[] {
  return readIndex();
}

export function getChat(id: string): Chat | null {
  assertChatId(id);
  try {
    return parseChat(readFileSync(chatFile(id), "utf8"), id);
  } catch {
    return null;
  }
}

function saveChat(chat: Chat): Chat {
  mkdirSync(chatsDir(), { recursive: true });
  // The chat first, the index second: an index entry for a chat that does not
  // exist is a dead row, while the reverse is only a row that shows up late.
  writeJsonAtomic(chatFile(chat.id), chat);
  writeIndex([...readIndex().filter((entry) => entry.id !== chat.id), summarize(chat)]);
  return chat;
}

/** A chat is named after what was first asked, which is how people find it again. */
function titleFrom(text: string): string {
  const line = text.trim().split("\n")[0]?.replace(/\s+/g, " ") ?? "";
  if (!line) return "New session";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}...` : line;
}

function message(
  role: ChatMessage["role"],
  text: string,
  sources: MessageSource[] = [],
): ChatMessage {
  return {
    id: randomUUID(),
    role,
    text,
    createdAt: new Date().toISOString(),
    ...(sources.length > 0 ? { sources } : {}),
  };
}

export function createChat(firstMessage: string, documentIds: string[] = []): Chat {
  const now = new Date().toISOString();
  return saveChat({
    id: randomUUID(),
    title: titleFrom(firstMessage),
    createdAt: now,
    updatedAt: now,
    messages: [{ ...message("user", firstMessage), createdAt: now }],
    documentIds: [...new Set(documentIds)].slice(0, LIMITS.documentsPerChat),
  });
}

/** Attaching and detaching are not activity: the chat keeps its place in the list. */
export function setDocuments(id: string, change: (current: string[]) => string[]): Chat {
  const chat = getChat(id);
  if (!chat) throw new Error("That chat no longer exists.");
  chat.documentIds = [...new Set(change(chat.documentIds))].slice(0, LIMITS.documentsPerChat);
  return saveChat(chat);
}

export function appendMessage(
  id: string,
  role: ChatMessage["role"],
  text: string,
  sources: MessageSource[] = [],
): Chat {
  const chat = getChat(id);
  if (!chat) throw new Error("That chat no longer exists.");
  chat.messages.push(message(role, text, sources));
  chat.updatedAt = new Date().toISOString();
  return saveChat(chat);
}

export function renameChat(id: string, title: string): ChatSummary {
  const chat = getChat(id);
  if (!chat) throw new Error("That chat no longer exists.");
  const cleaned = title.replace(/\s+/g, " ").trim().slice(0, LIMITS.titleChars);
  if (!cleaned) throw new Error("A chat needs a name.");
  // Renaming is not activity: the chat keeps its place in the list.
  chat.title = cleaned;
  return summarize(saveChat(chat));
}

export function removeChat(id: string): void {
  assertChatId(id);
  rmSync(chatFile(id), { force: true });
  writeIndex(readIndex().filter((entry) => entry.id !== id));
}
