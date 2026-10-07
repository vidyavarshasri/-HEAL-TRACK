import { getAuth } from "@clerk/express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { db, uploadedObjectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireClerkAuth } from "../middlewares/requireClerkAuth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 10 * 1024 * 1024;

function ownerId(req: Request): string {
  const id = getAuth(req).userId;
  if (!id) throw new Error("Authenticated route received no Clerk user.");
  return id;
}

function notFound(res: Response) {
  res.status(404).json({ error: "Image not found." });
}

router.post(
  "/storage/uploads/request-url",
  requireClerkAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (
      !parsed.success ||
      !parsed.data.name.trim() ||
      !imageContentTypes.has(parsed.data.contentType) ||
      parsed.data.size > maxImageSize
    ) {
      res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image under 10 MB." });
      return;
    }

    const upload = await objectStorage.getObjectEntityUploadDetails();
    await db.insert(uploadedObjectsTable).values({
      ownerId: ownerId(req),
      objectPath: upload.objectPath,
      fileName: parsed.data.name.trim(),
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL: upload.uploadURL,
        objectPath: upload.objectPath,
      }),
    );
  },
);

router.get(
  /^\/storage\/objects\/(.+)$/,
  requireClerkAuth,
  async (req: Request, res: Response) => {
    const suffix = req.params[0];
    if (
      typeof suffix !== "string" ||
      !/^uploads\/[0-9a-f-]{36}$/i.test(suffix)
    ) {
      notFound(res);
      return;
    }

    const objectPath = `/objects/${suffix}`;
    const userId = ownerId(req);
    const [upload] = await db
      .select()
      .from(uploadedObjectsTable)
      .where(
        and(
          eq(uploadedObjectsTable.ownerId, userId),
          eq(uploadedObjectsTable.objectPath, objectPath),
        ),
      )
      .limit(1);
    if (!upload) {
      notFound(res);
      return;
    }

    try {
      const file = await objectStorage.getObjectEntityFile(objectPath);
      if (
        !(await objectStorage.canAccessObjectEntity({
          userId,
          objectFile: file,
        }))
      ) {
        notFound(res);
        return;
      }

      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      if (
        contentType !== upload.contentType ||
        Number(metadata.size) !== upload.size ||
        !imageContentTypes.has(contentType)
      ) {
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
