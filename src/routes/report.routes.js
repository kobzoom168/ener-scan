import { Router } from "express";
import * as reportController from "../controllers/report.controller.js";
import * as publicReportApiController from "../controllers/publicReportApi.controller.js";

const router = Router();

router.get("/r/demo", reportController.getReportDemo);
router.post(
  "/r/:publicToken/library/pin",
  reportController.postLibraryPinUpload,
);
router.get("/r/:publicToken/library", reportController.getLibraryRankingByToken);
router.get(
  "/r/:publicToken/energy-meaning",
  reportController.getEnergyMeaningByToken,
);
router.get(
  "/r/:publicToken/energy-timing",
  reportController.getEnergyTimingByToken,
);
router.get("/r/:publicToken", reportController.getReportByToken);

router.get(
  "/api/public-report/:publicToken",
  publicReportApiController.getPublicReportJson,
);

export default router;
