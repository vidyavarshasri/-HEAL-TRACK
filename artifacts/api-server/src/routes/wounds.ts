import { getAuth } from "@clerk/express";
import {
  CreateWoundBody,
  CreateWoundResponse,
  CreateWoundShareParams,
  CreateWoundShareBody,
  CreateWoundShareResponse,
  CreateWoundUpdateBody,
  CreateWoundUpdateResponse,
  GetDashboardResponse,
  GetWoundParams,
  GetWoundResponse,
  ListWoundUpdatesParams,
  ListWoundUpdatesResponse,
  ListWoundsResponse,
  RevokeWoundShareParams,
} from "@workspace/api-zod";
import {
  db,
  uploadedObjectsTable,
  woundSharesTable,
  woundUpdatesTable,
  woundsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";
import { assessRiskAwareness } from "../lib/risk-awareness";
import { requireClerkAuth } from "../middlewares/requireClerkAuth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const emptySymptomsDisclaimer =
  "This symptom-based summary is for tracking and communication only. It is not a diagnosis, treatment recommendation, or substitute for professional medical care. Seek emergency care for severe bleeding, severe pain, rapidly worsening symptoms, or if you feel seriously unwell.";

function ownerId(req: Request): string {
  const id = getAuth(req).userId;
  if (!id) throw new Error("Authenticated route received no Clerk user.");
  return id;
}

function toUpdateDto(row: typeof woundUpdatesTable.$inferSelect) {
  return {
    id: row.id,
    woundId: row.woundId,
    createdAt: row.createdAt.toISOString(),
    painLevel: row.painLevel,
    swelling: row.swelling,
    redness: row.redness,
    discharge: row.discharge,
    bleeding: row.bleeding,
    fever: row.fever,
    odor: row.odor,
    rapidWorsening: row.rapidWorsening,
    notes: row.notes,
    transcription: row.transcription,
    imagePaths: row.imagePaths,
    riskLevel: row.riskLevel,
    riskReasons: row.riskReasons,
  };
}

async function getOwnedWound(userId: string, id: number) {
  const [wound] = await db
    .select()
    .from(woundsTable)
    .where(and(eq(woundsTable.id, id), eq(woundsTable.ownerId, userId)))
    .limit(1);
  return wound;
}

async function toWoundDto(userId: string, woundId: number) {
  const [wound] = await db
    .select()
    .from(woundsTable)
    .where(and(eq(woundsTable.id, woundId), eq(woundsTable.ownerId, userId)))
    .limit(1);
  if (!wound) return null;

  const updates = await db
    .select()
    .from(woundUpdatesTable)
    .where(and(eq(woundUpdatesTable.woundId, woundId), eq(woundUpdatesTable.ownerId, userId)))
    .orderBy(desc(woundUpdatesTable.createdAt));

  return {
    id: wound.id,
    name: wound.name,
    bodySite: wound.bodySite,
    createdAt: wound.createdAt.toISOString(),
    updateCount: updates.length,
    latestUpdate: updates[0] ? toUpdateDto(updates[0]) : null,
  };
}

router.use(requireClerkAuth);

router.get("/dashboard", async (req: Request, res: Response) => {
  const userId = ownerId(req);
  const wounds = await db
    .select()
    .from(woundsTable)
    .where(eq(woundsTable.ownerId, userId))
    .orderBy(desc(woundsTable.createdAt));
  const updates = await db
    .select()
    .from(woundUpdatesTable)
    .where(eq(woundUpdatesTable.ownerId, userId))
    .orderBy(desc(woundUpdatesTable.createdAt));
  const byId = new Map<number, typeof updates>();
  for (const update of updates) {
    const values = byId.get(update.woundId) ?? [];
    values.push(update);
    byId.set(update.woundId, values);
  }
  res.json(
    GetDashboardResponse.parse({
      woundCount: wounds.length,
      updateCount: updates.length,
      latestUpdate: updates[0] ? toUpdateDto(updates[0]) : null,
      wounds: wounds.map((wound) => {
        const entries = byId.get(wound.id) ?? [];
        return {
          id: wound.id,
          name: wound.name,
          bodySite: wound.bodySite,
          createdAt: wound.createdAt.toISOString(),
          updateCount: entries.length,
          latestUpdate: entries[0] ? toUpdateDto(entries[0]) : null,
        };
      }),
    }),
  );
});

router.get("/wounds", async (req: Request, res: Response) => {
  const userId = ownerId(req);
  const rows = await db
    .select({ id: woundsTable.id })
    .from(woundsTable)
    .where(eq(woundsTable.ownerId, userId))
    .orderBy(desc(woundsTable.createdAt));
  const results = await Promise.all(
    rows.map(({ id }) => toWoundDto(userId, id)),
  );
  res.json(ListWoundsResponse.parse(results.filter((item) => item !== null)));
});

router.post("/wounds", async (req: Request, res: Response) => {
  const parsed = CreateWoundBody.safeParse(req.body);
  if (
    !parsed.success ||
    !parsed.data.name.trim() ||
    !parsed.data.bodySite.trim()
  ) {
    res.status(400).json({ error: "Enter a wound name and body site." });
    return;
  }
  const [row] = await db
    .insert(woundsTable)
    .values({
      ownerId: ownerId(req),
      name: parsed.data.name.trim(),
      bodySite: parsed.data.bodySite.trim(),
    })
    .returning();
  res.status(201).json(
    CreateWoundResponse.parse({
      id: row.id,
      name: row.name,
      bodySite: row.bodySite,
      createdAt: row.createdAt.toISOString(),
      updateCount: 0,
      latestUpdate: null,
    }),
  );
});

router.get("/wounds/:id", async (req: Request, res: Response) => {
  const parsed = GetWoundParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid wound." });
    return;
  }
  const wound = await toWoundDto(ownerId(req), parsed.data.id);
  if (!wound) {
    res.status(404).json({ error: "Wound not found." });
    return;
  }
  res.json(GetWoundResponse.parse(wound));
});

router.get("/wounds/:id/updates", async (req: Request, res: Response) => {
  const parsed = ListWoundUpdatesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid wound." });
    return;
  }
  const userId = ownerId(req);
  if (!(await getOwnedWound(userId, parsed.data.id))) {
    res.status(404).json({ error: "Wound not found." });
    return;
  }
  const updates = await db
    .select()
    .from(woundUpdatesTable)
    .where(
      and(
        eq(woundUpdatesTable.woundId, parsed.data.id),
        eq(woundUpdatesTable.ownerId, userId),
      ),
    )
    .orderBy(desc(woundUpdatesTable.createdAt));
  res.json(ListWoundUpdatesResponse.parse(updates.map(toUpdateDto)));
});

router.post("/wounds/:id/updates", async (req: Request, res: Response) => {
  const parsedParams = ListWoundUpdatesParams.safeParse(req.params);
  const parsedBody = CreateWoundUpdateBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Check the symptom values and try again." });
    return;
  }
  const userId = ownerId(req);
  const wound = await getOwnedWound(userId, parsedParams.data.id);
  if (!wound) {
    res.status(404).json({ error: "Wound not found." });
    return;
  }

  const imagePaths = parsedBody.data.imagePaths;
  if (imagePaths.length > 0) {
    if (new Set(imagePaths).size !== imagePaths.length) {
      res.status(400).json({ error: "An image can only be attached once." });
      return;
    }
    const uploads = await db
      .select()
      .from(uploadedObjectsTable)
      .where(
        and(
          eq(uploadedObjectsTable.ownerId, userId),
          inArray(uploadedObjectsTable.objectPath, imagePaths),
        ),
      );
    if (uploads.length !== imagePaths.length) {
      res.status(400).json({ error: "An image upload is not available." });
      return;
    }
    for (const path of imagePaths) {
      try {
        const upload = uploads.find((candidate) => candidate.objectPath === path);
        const file = await objectStorage.getObjectEntityFile(path);
        const [metadata] = await file.getMetadata();
        if (
          !upload ||
          Number(metadata.size) !== upload.size ||
          metadata.contentType !== upload.contentType ||
          !["image/jpeg", "image/png", "image/webp"].includes(
            String(metadata.contentType),
          )
        ) {
          throw new Error("Uploaded image metadata does not match.");
        }
        await objectStorage.trySetObjectEntityAclPolicy(path, {
          owner: userId,
          visibility: "private",
        });
      } catch {
        res.status(400).json({ error: "An image upload could not be verified." });
        return;
      }
    }
  }

  const assessment = assessSymptoms(parsedBody.data);
  const [row] = await db
    .insert(woundUpdatesTable)
    .values({
      ...parsedBody.data,
      woundId: wound.id,
      ownerId: userId,
      notes: parsedBody.data.notes ?? null,
      transcription: parsedBody.data.transcription ?? null,
      riskLevel: assessment.riskLevel,
      riskReasons: assessment.riskReasons,
    })
    .returning();
  res.status(201).json(CreateWoundUpdateResponse.parse(toUpdateDto(row)));
});

router.post("/wounds/:id/shares", async (req: Request, res: Response) => {
  const parsedParams = CreateWoundShareParams.safeParse(req.params);
  const parsedBody = CreateWoundShareBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Review the report sharing options." });
    return;
  }
  const userId = ownerId(req);
  const wound = await getOwnedWound(userId, parsedParams.data.id);
  if (!wound) {
    res.status(404).json({ error: "Wound not found." });
    return;
  }
  let updates = await db
    .select()
    .from(woundUpdatesTable)
    .where(
      and(
        eq(woundUpdatesTable.woundId, wound.id),
        eq(woundUpdatesTable.ownerId, userId),
      ),
    )
    .orderBy(desc(woundUpdatesTable.createdAt));

  const selectedIds = parsedBody.data.updateIds;
  if (selectedIds) {
    if (new Set(selectedIds).size !== selectedIds.length) {
      res.status(400).json({ error: "Selected updates must be unique." });
      return;
    }
    updates = updates.filter((update) => selectedIds.includes(update.id));
    if (updates.length !== selectedIds.length) {
      res.status(400).json({ error: "One or more selected updates are unavailable." });
      return;
    }
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + parsedBody.data.expiresInHours * 60 * 60 * 1000,
  );
  const snapshot = {
    woundName: wound.name,
    bodySite: wound.bodySite,
    generatedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    includeSymptoms: parsedBody.data.includeSymptoms,
    includeNotes: parsedBody.data.includeNotes,
    includeImages: parsedBody.data.includeImages,
    updates: updates.map((update) => ({
      id: update.id,
      createdAt: update.createdAt.toISOString(),
      painLevel: parsedBody.data.includeSymptoms ? update.painLevel : null,
      swelling: parsedBody.data.includeSymptoms ? update.swelling : null,
      redness: parsedBody.data.includeSymptoms ? update.redness : null,
      discharge: parsedBody.data.includeSymptoms ? update.discharge : null,
      bleeding: parsedBody.data.includeSymptoms ? update.bleeding : null,
      fever: parsedBody.data.includeSymptoms ? update.fever : null,
      odor: parsedBody.data.includeSymptoms ? update.odor : null,
      rapidWorsening: parsedBody.data.includeSymptoms
        ? update.rapidWorsening
        : null,
      notes: parsedBody.data.includeNotes ? update.notes : null,
      transcription: parsedBody.data.includeNotes ? update.transcription : null,
      imagePaths: parsedBody.data.includeImages ? update.imagePaths : [],
      riskLevel: parsedBody.data.includeSymptoms ? update.riskLevel : null,
      riskReasons: parsedBody.data.includeSymptoms ? update.riskReasons : [],
    })),
    riskDisclaimer: emptySymptomsDisclaimer,
  };
  const [share] = await db
    .insert(woundSharesTable)
    .values({
      woundId: wound.id,
      ownerId: userId,
      tokenHash,
      expiresAt,
      includeSymptoms: parsedBody.data.includeSymptoms,
      includeNotes: parsedBody.data.includeNotes,
      includeImages: parsedBody.data.includeImages,
      snapshot,
    })
    .returning();
  res.status(201).json(
    CreateWoundShareResponse.parse({
      id: share.id,
      token,
      expiresAt: share.expiresAt.toISOString(),
    }),
  );
});

router.delete(
  "/wounds/:id/shares/:shareId",
  async (req: Request, res: Response) => {
    const parsed = RevokeWoundShareParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid share link." });
      return;
    }
    const userId = ownerId(req);
    const [share] = await db
      .select({ id: woundSharesTable.id })
      .from(woundSharesTable)
      .where(
        and(
          eq(woundSharesTable.id, parsed.data.shareId),
          eq(woundSharesTable.woundId, parsed.data.id),
          eq(woundSharesTable.ownerId, userId),
        ),
      )
      .limit(1);
    if (!share) {
      res.status(404).json({ error: "Share link not found." });
      return;
    }
    await db
      .update(woundSharesTable)
      .set({ revokedAt: new Date() })
      .where(eq(woundSharesTable.id, share.id));
    res.status(204).end();
  },
);

function assessSymptoms(input: {
  painLevel: number;
  swelling: string;
  redness: string;
  discharge: string;
  bleeding: boolean;
  fever: boolean;
  odor: boolean;
  rapidWorsening: boolean;
}) {
  return assessRiskAwareness(input);
}

export { emptySymptomsDisclaimer };
export default router;
