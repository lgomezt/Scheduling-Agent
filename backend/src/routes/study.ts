import { Router } from "express";
import { getVisibleStudyConfig } from "../study/config.js";

export const studyRouter = Router();

studyRouter.get("/config", (_req, res) => {
  res.json(getVisibleStudyConfig());
});
