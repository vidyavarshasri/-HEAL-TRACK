import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  await db.execute(sql`select 1`);
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
