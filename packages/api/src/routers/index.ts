import { publicProcedure, router } from "../index";
import { chatRouter } from "./chat";
import { knowledgeRouter } from "./knowledge";
import { modelsRouter } from "./models";
import { onboardingRouter } from "./onboarding";
import { searchRouter } from "./search";
import { teamRouter } from "./team";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  onboarding: onboardingRouter,
  models: modelsRouter,
  knowledge: knowledgeRouter,
  chat: chatRouter,
  search: searchRouter,
  team: teamRouter,
});

export type AppRouter = typeof appRouter;
