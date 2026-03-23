import { Router } from "express";
import * as reportController from "../controllers/report.controller.js";

const router = Router();

router.get("/r/demo", reportController.getReportDemo);
router.get("/r/:publicToken", reportController.getReportByToken);

export default router;
