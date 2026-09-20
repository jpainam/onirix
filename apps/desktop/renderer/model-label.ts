import { PROVIDERS } from "@onirix/llm/catalog";

import type { ModelChoice } from "../src/local-bridge";

/** The model's name as the catalog spells it, or its id when the catalog has none. */
export function modelLabel(choice: ModelChoice): string {
  const provider = choice.kind === "local" ? "ollama" : choice.provider;
  return (
    PROVIDERS[provider].chatModels.find((model) => model.id === choice.model)?.label ?? choice.model
  );
}

/** One sentence on where answers come from, for the setup summary and Settings. */
export function describeChoice(choice: ModelChoice): string {
  return choice.kind === "local"
    ? `${modelLabel(choice)}, running on this computer.`
    : `${modelLabel(choice)}, through your ${PROVIDERS[choice.provider].label} key.`;
}
