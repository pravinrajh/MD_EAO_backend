import { assistantActionController } from "./assistantAction.controller";
import { assistantController } from "./assistant.controller";

export const aiController = {
  query: assistantController.queryAssistant,
  action: assistantActionController.processAction,
  chat: assistantController.chat,
};
