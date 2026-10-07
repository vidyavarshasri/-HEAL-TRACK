import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const woundsTable = pgTable(
  "wounds",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    bodySite: varchar("body_site", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("wounds_owner_created_idx").on(table.ownerId, table.createdAt)],
);

export const woundUpdatesTable = pgTable(
  "wound_updates",
  {
    id: serial("id").primaryKey(),
    woundId: integer("wound_id")
      .references(() => woundsTable.id, { onDelete: "cascade" })
      .notNull(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    painLevel: integer("pain_level").notNull(),
    swelling: varchar("swelling", { length: 20 }).notNull(),
    redness: varchar("redness", { length: 20 }).notNull(),
    discharge: varchar("discharge", { length: 20 }).notNull(),
    bleeding: boolean("bleeding").default(false).notNull(),
    fever: boolean("fever").default(false).notNull(),
    odor: boolean("odor").default(false).notNull(),
    rapidWorsening: boolean("rapid_worsening").default(false).notNull(),
    notes: text("notes"),
    transcription: text("transcription"),
    imagePaths: jsonb("image_paths").$type<string[]>().default([]).notNull(),
    riskLevel: varchar("risk_level", { length: 30 }).notNull(),
    riskReasons: jsonb("risk_reasons").$type<string[]>().default([]).notNull(),
  },
  (table) => [
    index("wound_updates_owner_created_idx").on(table.ownerId, table.createdAt),
    index("wound_updates_wound_created_idx").on(table.woundId, table.createdAt),
  ],
);

export const uploadedObjectsTable = pgTable(
  "uploaded_objects",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    objectPath: text("object_path").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uploaded_objects_path_unique").on(table.objectPath),
    index("uploaded_objects_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const woundSharesTable = pgTable(
  "wound_shares",
  {
    id: serial("id").primaryKey(),
    woundId: integer("wound_id")
      .references(() => woundsTable.id, { onDelete: "cascade" })
      .notNull(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    includeSymptoms: boolean("include_symptoms").default(true).notNull(),
    includeNotes: boolean("include_notes").default(false).notNull(),
    includeImages: boolean("include_images").default(false).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("wound_shares_token_hash_unique").on(table.tokenHash),
    index("wound_shares_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);
