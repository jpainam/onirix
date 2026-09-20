/**
 * The open models Onirix offers to download, with what a person needs to know
 * before spending the disk space: who made it, how big it is, what it can do.
 *
 * Every id is an Ollama library tag, so it is exactly what `ollama pull`
 * takes, and each one names its size outright (`qwen3.5:9b`, never a bare
 * `latest` that can move). The Ollama provider's chat models in `catalog.ts`
 * are derived from this list, so a model shown in the browser is always one
 * a workspace can enable.
 *
 * Order matters to `catalog.ts`: the first three are what a new Ollama
 * connection starts with, so new entries go at the end. The browser sorts by
 * release date and does not care.
 *
 * Sizes and context windows were read from ollama.com on 2026-09-19. They are
 * what the download card quotes before the real figure arrives with the pull.
 */
export type OpenModelCapability = "vision" | "tools" | "reasoning";

export type OpenModel = {
  /** Ollama library tag. */
  id: string;
  label: string;
  publisher: string;
  /** One line, for the list. */
  summary: string;
  /** A short paragraph, for the details pane. */
  description: string;
  /** As the publisher states it, e.g. "27B" or "35B, 3B active". */
  parameters: string;
  contextTokens: number;
  capabilities: OpenModelCapability[];
  /** Approximate size on disk of this tag, in GB. */
  downloadGb: number;
  license: string;
  /** Year and month of release, `YYYY-MM`. */
  released: string;
  /** The publisher's repository on Hugging Face, `owner/name`. */
  huggingFace: string;
};

export const OPEN_MODELS: OpenModel[] = [
  {
    id: "llama3.3",
    label: "Llama 3.3 70B",
    publisher: "Meta",
    summary: "Meta's 70B model. Needs a workstation or a server.",
    description:
      "A 70B instruction model with quality close to the much larger Llama 3.1 405B. It is a server model: plan for 48 GB of memory or more.",
    parameters: "70B",
    contextTokens: 131_072,
    capabilities: ["tools"],
    downloadGb: 43,
    license: "Llama 3.3 Community License",
    released: "2024-12",
    huggingFace: "meta-llama/Llama-3.3-70B-Instruct",
  },
  {
    id: "qwen2.5",
    label: "Qwen 2.5 7B",
    publisher: "Alibaba",
    summary: "A small, dependable general model.",
    description:
      "A 7B general model that follows instructions well and is strong in many languages. Runs on most laptops.",
    parameters: "7B",
    contextTokens: 32_768,
    capabilities: ["tools"],
    downloadGb: 4.7,
    license: "Apache 2.0",
    released: "2024-09",
    huggingFace: "Qwen/Qwen2.5-7B-Instruct",
  },
  {
    id: "mistral",
    label: "Mistral 7B",
    publisher: "Mistral AI",
    summary: "The 7B model from Mistral AI. Light and fast.",
    description:
      "One of the lightest models that is still useful for everyday questions. A good first download on a modest machine.",
    parameters: "7B",
    contextTokens: 32_768,
    capabilities: ["tools"],
    downloadGb: 4.4,
    license: "Apache 2.0",
    released: "2024-05",
    huggingFace: "mistralai/Mistral-7B-Instruct-v0.3",
  },
  {
    id: "gpt-oss:20b",
    label: "gpt-oss 20B",
    publisher: "OpenAI",
    summary: "OpenAI's open-weight reasoning model, laptop size.",
    description:
      "An open-weight model from OpenAI built for reasoning and tool use. Fits in 16 GB of memory.",
    parameters: "21B, 3.6B active",
    contextTokens: 131_072,
    capabilities: ["tools", "reasoning"],
    downloadGb: 14,
    license: "Apache 2.0",
    released: "2025-08",
    huggingFace: "openai/gpt-oss-20b",
  },
  {
    id: "gpt-oss:120b",
    label: "gpt-oss 120B",
    publisher: "OpenAI",
    summary: "OpenAI's larger open-weight reasoning model.",
    description:
      "The larger gpt-oss. It is built to run on a single 80 GB GPU, so it belongs on a server.",
    parameters: "117B, 5.1B active",
    contextTokens: 131_072,
    capabilities: ["tools", "reasoning"],
    downloadGb: 65,
    license: "Apache 2.0",
    released: "2025-08",
    huggingFace: "openai/gpt-oss-120b",
  },
  {
    id: "qwen3",
    label: "Qwen 3 8B",
    publisher: "Alibaba",
    summary: "An 8B model that can think before it answers.",
    description:
      "An 8B model with a thinking mode for harder questions and solid tool use. Runs on most laptops.",
    parameters: "8B",
    contextTokens: 40_960,
    capabilities: ["tools", "reasoning"],
    downloadGb: 5.2,
    license: "Apache 2.0",
    released: "2025-04",
    huggingFace: "Qwen/Qwen3-8B",
  },
  {
    id: "deepseek-r1",
    label: "DeepSeek R1 8B",
    publisher: "DeepSeek",
    summary: "DeepSeek's reasoning, distilled into an 8B model.",
    description:
      "The reasoning of DeepSeek R1 distilled into Qwen 3 8B. It works through a problem step by step, which makes it slower and more careful.",
    parameters: "8B",
    contextTokens: 131_072,
    capabilities: ["tools", "reasoning"],
    downloadGb: 5.2,
    license: "MIT",
    released: "2025-05",
    huggingFace: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
  },
  {
    id: "gemma3",
    label: "Gemma 3 4B",
    publisher: "Google",
    summary: "A small Google model that also reads images.",
    description:
      "A 4B model that understands images as well as text. The smallest download here that is still broadly capable.",
    parameters: "4B",
    contextTokens: 131_072,
    capabilities: ["vision"],
    downloadGb: 3.3,
    license: "Gemma Terms of Use",
    released: "2025-03",
    huggingFace: "google/gemma-3-4b-it",
  },
  {
    id: "phi4",
    label: "Phi-4 14B",
    publisher: "Microsoft",
    summary: "Microsoft's 14B model, strong at maths and logic.",
    description:
      "A 14B model trained with a focus on reasoning quality. Its context window is short, so it suits questions more than long documents.",
    parameters: "14B",
    contextTokens: 16_384,
    capabilities: [],
    downloadGb: 9.1,
    license: "MIT",
    released: "2024-12",
    huggingFace: "microsoft/phi-4",
  },
  {
    id: "mistral-small3.2",
    label: "Mistral Small 3.2 24B",
    publisher: "Mistral AI",
    summary: "A 24B model with vision and reliable tool calls.",
    description:
      "A 24B model that reads images and calls tools reliably. Comfortable with 32 GB of memory.",
    parameters: "24B",
    contextTokens: 131_072,
    capabilities: ["vision", "tools"],
    downloadGb: 15,
    license: "Apache 2.0",
    released: "2025-06",
    huggingFace: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
  },
  {
    id: "qwen3.5:4b",
    label: "Qwen 3.5 4B",
    publisher: "Alibaba",
    summary: "A small multimodal model with a long context.",
    description:
      "A 4B model that reads images, calls tools and can think before answering, with a 256K context window. A good fit for 8 GB machines.",
    parameters: "4B",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 3.4,
    license: "Apache 2.0",
    released: "2026-02",
    huggingFace: "Qwen/Qwen3.5-4B",
  },
  {
    id: "qwen3.5:9b",
    label: "Qwen 3.5 9B",
    publisher: "Alibaba",
    summary: "A capable all-rounder for a 16 GB laptop.",
    description:
      "A 9B model that reads images, calls tools and can think before answering, with a 256K context window. A sensible default on a 16 GB laptop.",
    parameters: "9B",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 6.6,
    license: "Apache 2.0",
    released: "2026-02",
    huggingFace: "Qwen/Qwen3.5-9B",
  },
  {
    id: "qwen3.6:27b",
    label: "Qwen 3.6 27B",
    publisher: "Alibaba",
    summary: "A dense 27B model tuned for agentic work and coding.",
    description:
      "A dense 27B model with upgrades in agentic coding and thinking over Qwen 3.5. Plan for 32 GB of memory.",
    parameters: "27B",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 18,
    license: "Apache 2.0",
    released: "2026-04",
    huggingFace: "Qwen/Qwen3.6-27B",
  },
  {
    id: "qwen3.6:35b",
    label: "Qwen 3.6 35B A3B",
    publisher: "Alibaba",
    summary: "35B of knowledge at the speed of a 3B model.",
    description:
      "A mixture-of-experts model: 35B parameters on disk, 3B active per token, so it answers quickly once loaded. Plan for 32 GB of memory.",
    parameters: "35B, 3B active",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 23,
    license: "Apache 2.0",
    released: "2026-04",
    huggingFace: "Qwen/Qwen3.6-35B-A3B",
  },
  {
    id: "gemma4:e4b",
    label: "Gemma 4 E4B",
    publisher: "Google",
    summary: "Google's small Gemma 4, built for laptops.",
    description:
      "The effective-4B Gemma 4. It reads images, calls tools and can think before answering, with a 128K context window.",
    parameters: "4B effective",
    contextTokens: 131_072,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 9.6,
    license: "Apache 2.0",
    released: "2026-04",
    huggingFace: "google/gemma-4-E4B-it",
  },
  {
    id: "gemma4:12b",
    label: "Gemma 4 12B",
    publisher: "Google",
    summary: "The mid-size Gemma 4, with a 256K context.",
    description:
      "A 12B model that reads images, calls tools and can think before answering. Runs well on a 16 GB laptop.",
    parameters: "12B",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 7.6,
    license: "Apache 2.0",
    released: "2026-04",
    huggingFace: "google/gemma-4-12B-it",
  },
  {
    id: "gemma4:31b",
    label: "Gemma 4 31B",
    publisher: "Google",
    summary: "The largest dense Gemma 4.",
    description:
      "A dense 31B model, the most capable Gemma 4 that still runs on one machine. Plan for 32 GB of memory.",
    parameters: "31B",
    contextTokens: 262_144,
    capabilities: ["vision", "tools", "reasoning"],
    downloadGb: 20,
    license: "Apache 2.0",
    released: "2026-04",
    huggingFace: "google/gemma-4-31B-it",
  },
];

export function findOpenModel(id: string): OpenModel | undefined {
  return OPEN_MODELS.find((model) => model.id === id);
}

/** The list as the browser shows it: newest first, smaller first within a release. */
export function browseOpenModels(): OpenModel[] {
  return [...OPEN_MODELS].sort(
    (a, b) => b.released.localeCompare(a.released) || a.downloadGb - b.downloadGb,
  );
}
