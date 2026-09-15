import { publicProcedure, router } from "../index";
import { chatRouter } from "./chat";
import { knowledgeRouter } from "./knowledge";
import { onboardingRouter } from "./onboarding";
import { searchRouter } from "./search";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  onboarding: onboardingRouter,
  knowledge: knowledgeRouter,
  chat: chatRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
