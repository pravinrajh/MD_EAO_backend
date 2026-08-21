import type { AssistantActionIntent } from "../../utils/constants";
import { resolveActionEntities } from "./actionIntentRouter.service";
import { resolveEntities } from "./intentRouter.service";
import type { ActionActor, ExtractedActionEntities, ResolvedActionEntities } from "./action.types";
import type { AssistantActor, ExtractedEntities, ResolvedEntities } from "./types";

export const entityResolver = {
  resolveQuery(
    extracted: ExtractedEntities,
    actor: AssistantActor,
    options?: { requireProject?: boolean; requireEmployee?: boolean },
  ): Promise<ResolvedEntities> {
    return resolveEntities(extracted, actor, options);
  },

  resolveAction(
    extracted: ExtractedActionEntities,
    actor: ActionActor,
    options?: {
      intent?: AssistantActionIntent;
      needTask?: boolean;
      needMeeting?: boolean;
      needProject?: boolean;
      needEmployee?: boolean;
    },
  ): Promise<ResolvedActionEntities> {
    return resolveActionEntities(extracted, actor, options);
  },
};
