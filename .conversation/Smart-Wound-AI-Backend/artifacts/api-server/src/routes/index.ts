import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sharedReportsRouter from "./shared-reports";
import storageRouter from "./storage";
import woundsRouter from "./wounds";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sharedReportsRouter);
router.use(storageRouter);
router.use(woundsRouter);

export default router;
