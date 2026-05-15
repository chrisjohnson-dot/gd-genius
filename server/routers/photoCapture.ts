import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { mediaAttachments } from '../../drizzle/schema';
import { storagePut } from '../storage';

// ─── Photo Capture Router ─────────────────────────────────────────────────────
// Handles uploading photos to S3 and linking them to entities (orders, exceptions, QC sessions)
// Uses Drizzle typed selects throughout to avoid MySQL2 raw string coercion issues.

export const photoCaptureRouter = router({
  // Upload a base64-encoded photo and store it in S3
  upload: protectedProcedure
    .input(z.object({
      entityType: z.string().max(64),
      entityId: z.string().max(128),
      category: z.enum(['item_condition', 'packaging', 'damage', 'label', 'other']).default('other'),
      base64Data: z.string(), // data:image/jpeg;base64,... or raw base64
      mimeType: z.string().default('image/jpeg'),
      note: z.string().max(1000).optional(),
      fileSizeBytes: z.number().int().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');

      // Strip data URL prefix if present
      const base64 = input.base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');

      // Generate unique file key
      const ext = input.mimeType.split('/')[1] || 'jpg';
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `photos/${input.entityType}/${input.entityId}/${Date.now()}-${randomSuffix}.${ext}`;

      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Insert DB record using Drizzle typed insert
      const now = Date.now();
      await db.insert(mediaAttachments).values({
        entityType: input.entityType,
        entityId: input.entityId,
        category: input.category,
        fileKey,
        fileUrl: url,
        fileSizeBytes: input.fileSizeBytes || buffer.length,
        mimeType: input.mimeType,
        note: input.note ?? null,
        capturedBy: ctx.user.id,
        capturedAt: now,
      });

      // Fetch the inserted row using typed select
      const rows = await db
        .select()
        .from(mediaAttachments)
        .where(eq(mediaAttachments.fileKey, fileKey))
        .limit(1);

      return { success: true, attachment: rows[0] ?? null };
    }),

  // List photos for an entity
  list: protectedProcedure
    .input(z.object({
      entityType: z.string().max(64),
      entityId: z.string().max(128),
      category: z.enum(['item_condition', 'packaging', 'damage', 'label', 'other']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');

      const conditions = [
        eq(mediaAttachments.entityType, input.entityType),
        eq(mediaAttachments.entityId, input.entityId),
        ...(input.category ? [eq(mediaAttachments.category, input.category)] : []),
      ];

      const rows = await db
        .select()
        .from(mediaAttachments)
        .where(and(...conditions))
        .orderBy(desc(mediaAttachments.capturedAt));

      return rows;
    }),

  // Delete a photo
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.delete(mediaAttachments).where(eq(mediaAttachments.id, input.id));
      return { success: true };
    }),

  // Get photo count for multiple entities at once (for badge display)
  countBatch: protectedProcedure
    .input(z.object({
      entityType: z.string().max(64),
      entityIds: z.array(z.string().max(128)),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      if (input.entityIds.length === 0) return [];

      const rows = await db
        .select({
          entityId: mediaAttachments.entityId,
          count: sql<number>`COUNT(*)`,
        })
        .from(mediaAttachments)
        .where(
          and(
            eq(mediaAttachments.entityType, input.entityType),
            inArray(mediaAttachments.entityId, input.entityIds)
          )
        )
        .groupBy(mediaAttachments.entityId);

      return rows.map((r) => ({
        entityId: r.entityId,
        count: Number(r.count),
      }));
    }),
});
