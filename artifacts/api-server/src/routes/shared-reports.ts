import { GetSharedReportParams, GetSharedReportResponse } from "@workspace/api-zod";
import { db, woundSharesTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findActiveShare(token: string) {
  const [share] = await db
    .select()
    .from(woundSharesTable)
    .where(
      and(
        eq(woundSharesTable.tokenHash, hashToken(token)),
        isNull(woundSharesTable.revokedAt),
        gt(woundSharesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return share;
}

function notFound(res: Response) {
  res.status(404).json({ error: "This report is not available." });
}

router.get("/shared-reports/:token", async (req: Request, res: Response) => {
  const parsed = GetSharedReportParams.safeParse(req.params);
  if (!parsed.success || parsed.data.token.length > 128) {
    notFound(res);
    return;
  }

  const share = await findActiveShare(parsed.data.token);
  if (!share) {
    notFound(res);
    return;
  }

  const report = GetSharedReportResponse.parse(share.snapshot);
  const response = {
    ...report,
    updates: report.updates.map((update) => ({
      ...update,
      imagePaths: share.includeImages
        ? update.imagePaths.map(
            (path) =>
              `/shared-reports/${parsed.data.token}/images/${Buffer.from(path).toString("base64url")}`,
          )
        : [],
    })),
  };
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetSharedReportResponse.parse(response));
});

router.get(
  "/storage/shared-reports/:token/images/:imageId",
  async (req: Request, res: Response) => {
    const parsed = GetSharedReportParams.safeParse(req.params);
    const imageId = req.params.imageId;
    if (
      !parsed.success ||
      parsed.data.token.length > 128 ||
      typeof imageId !== "string" ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(imageId)
    ) {
      notFound(res);
      return;
    }

    const share = await findActiveShare(parsed.data.token);
    if (!share || !share.includeImages) {
      notFound(res);
      return;
    }

    const objectPath = Buffer.from(imageId, "base64url").toString("utf8");
    if (
      Buffer.from(objectPath).toString("base64url") !== imageId ||
      !/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)
    ) {
      notFound(res);
      return;
    }

    const snapshot = GetSharedReportResponse.safeParse(share.snapshot);
    const containsImage = snapshot.success &&
      snapshot.data.includeImages &&
      snapshot.data.updates.some((update) => update.imagePaths.includes(objectPath));
    if (!containsImage) {
      notFound(res);
      return;
    }

    try {
      const file = await objectStorage.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      if (!imageContentTypes.has(contentType)) {
        notFound(res);
        return;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

      const stream = file.createReadStream();
      stream.on("error", (error) => {
        if (res.headersSent) {
          res.destroy(error);
        } else {
          notFound(res);
        }
      });
      stream.pipe(res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        notFound(res);
        return;
      }
      throw error;
    }
  },
);

export default router;
