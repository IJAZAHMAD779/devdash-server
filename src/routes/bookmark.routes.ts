import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createBookmarkSchema,
  updateBookmarkSchema,
  bookmarkQuerySchema,
  batchCreateBookmarkSchema,
} from "../validators/bookmark.validator";
import {
  getBookmarks,
  createBookmark,
  getBookmarkById,
  updateBookmark,
  deleteBookmark,
  getBookmarkPreview,
  batchCreateBookmarks,
  toggleBookmarkFavorite,
} from "../controllers/bookmark.controller";

const router = Router();

// Invariant 2: Authentication and multi-tenant scoping
router.use(requireAuth);

router.get("/", validate({ query: bookmarkQuerySchema }), getBookmarks);
router.post("/", validate({ body: createBookmarkSchema }), createBookmark);
router.post("/batch", validate({ body: batchCreateBookmarkSchema }), batchCreateBookmarks);
router.get("/preview", getBookmarkPreview);
router.get("/:id", getBookmarkById);
router.put("/:id", validate({ body: updateBookmarkSchema }), updateBookmark);
router.patch("/:id/favorite", toggleBookmarkFavorite);
router.delete("/:id", deleteBookmark);

export default router;
