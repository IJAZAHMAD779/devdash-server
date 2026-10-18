import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createNoteSchema,
  updateNoteSchema,
  noteQuerySchema,
} from "../validators/note.validator";
import {
  getNotes,
  createNote,
  getNoteById,
  updateNote,
  deleteNote,
} from "../controllers/note.controller";

const router = Router();

// Invariant 2: Authentication and multi-tenant scoping
router.use(requireAuth);

router.get("/", validate({ query: noteQuerySchema }), getNotes);
router.post("/", validate({ body: createNoteSchema }), createNote);
router.get("/:id", getNoteById);
router.put("/:id", validate({ body: updateNoteSchema }), updateNote);
router.delete("/:id", deleteNote);

export default router;
