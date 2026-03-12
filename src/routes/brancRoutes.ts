// src/routes/brancRoutes.ts

import { Router } from "express";
import {
  createBranches,
  deleteBranches,
  updateBranches,
  getAllBranchLocations,
} from "../controllers/branchLocationController.ts";
import { authMiddleware, ownerMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.use(authMiddleware, ownerMiddleware(["owner"]));

router.get("/", getAllBranchLocations);
router.post("/", createBranches);
router.put("/:id", updateBranches);
router.delete("/:id", deleteBranches);

export default router;
