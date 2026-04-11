import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import { storagePut } from '../storage';

// ─── Photo Capture Router ─────────────────────────────────────────────────────
// Handles uploading photos to S3 and linking them to entities (orders, exceptions, QC sessions)

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

      // Insert DB record
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO media_attachments
          (entity_type, entity_id, category, file_key, file_url, file_size_bytes, mime_type, note, captured_by, captured_at)
        VALUES
          (${input.entityType}, ${input.entityId}, ${input.category}, ${fileKey}, ${url},
           ${input.fileSizeBytes || buffer.length}, ${input.mimeType}, ${input.note ?? null},
           ${ctx.user.id}, ${now})
      `);

      const rows = await db.execute<any>(sql`
        SELECT * FROM media_attachments WHERE file_key = ${fileKey} LIMIT 1
      `);

      return { success: true, attachment: (rows as any[])[0] };
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
      const rows = await db.execute<any>(sql`
        SELECT ma.*, u.name as captured_by_name
        FROM media_attachments ma
        LEFT JOIN users u ON u.id = ma.captured_by
        WHERE ma.entity_type = ${input.entityType}
          AND ma.entity_id = ${input.entityId}
          ${input.category ? sql`AND ma.category = ${input.category}` : sql``}
        ORDER BY ma.captured_at DESC
      `);
      return rows as any[];
    }),

  // Delete a photo
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.execute(sql`DELETE FROM media_attachments WHERE id = ${input.id}`);
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
      const rows = await db.execute<any>(sql`
        SELECT entity_id, COUNT(*) as count
        FROM media_attachments
        WHERE entity_type = ${input.entityType}
          AND entity_id IN (${sql.join(input.entityIds.map(id => sql`${id}`), sql`, `)})
        GROUP BY entity_id
      `);
      return (rows as any[]).map((r: any) => ({ entityId: r.entity_id, count: Number(r.count) }));
    }),
});
