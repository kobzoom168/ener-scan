import { Router } from "express";
import * as reportController from "../controllers/report.controller.js";
import * as publicReportApiController from "../controllers/publicReportApi.controller.js";

const router = Router();

router.get("/r/demo", reportController.getReportDemo);
router.get("/r/:publicToken/og.png", reportController.getReportOgPngByToken);
router.get("/r/:publicToken", reportController.getReportByToken);

router.get(
  "/api/public-report/:publicToken",
  publicReportApiController.getPublicReportJson,
);

export default router;
