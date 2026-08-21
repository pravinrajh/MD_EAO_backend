import { Router } from "express";
import { mdNoteController } from "../controllers/mdNote.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import { createMdNoteSchema, listMdNotesQuerySchema, updateMdNoteSchema } from "../validations/office.validation";

const router = Router();
router.use(authenticate);

router.get("/", validate(listMdNotesQuerySchema, "query"), mdNoteController.list);
router.post("/", authorize("MD", "ADMIN", "MANAGER"), validate(createMdNoteSchema), mdNoteController.create);
router.get("/:id", validateObjectIdParam, mdNoteController.getById);
router.patch("/:id", authorize("MD", "ADMIN", "MANAGER"), validateObjectIdParam, validate(updateMdNoteSchema), mdNoteController.update);
router.delete("/:id", authorize("MD", "ADMIN"), validateObjectIdParam, mdNoteController.remove);

export default router;
