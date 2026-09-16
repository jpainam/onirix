import { publicProcedure, router } from "../index";
import { chatRouter } from "./chat";
import { historyRouter } from "./history";
import { knowledgeRouter } from "./knowledge";
import { modelsRouter } from "./models";
import { onboardingRouter } from "./onboarding";
import { searchRouter } from "./search";
import { skillRouter } from "./skill";
import { teamRouter } from "./team";
import { usageRouter } from "./usage";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  onboarding: onboardingRouter,
  models: modelsRouter,
  knowledge: knowledgeRouter,
  chat: chatRouter,
  history: historyRouter,
  search: searchRouter,
  skill: skillRouter,
  team: teamRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
