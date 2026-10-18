import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createBookmarkSchema,
  updateBookmarkSchema,
  bookmarkQuerySchema,
} from "../validators/bookmark.validator";
import {
  getBookmarks,
  createBookmark,
  getBookmarkById,
  updateBookmark,
  deleteBookmark,
} from "../controllers/bookmark.controller";

const router = Router();

// Invariant 2: Authentication and multi-tenant scoping
router.use(requireAuth);

router.get("/", validate({ query: bookmarkQuerySchema }), getBookmarks);
router.post("/", validate({ body: createBookmarkSchema }), createBookmark);
router.get("/:id", getBookmarkById);
router.put("/:id", validate({ body: updateBookmarkSchema }), updateBookmark);
router.delete("/:id", deleteBookmark);

export default router;
