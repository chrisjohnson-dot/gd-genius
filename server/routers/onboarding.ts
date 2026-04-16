import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ─── Default onboarding steps for each role ───────────────────────────────────
const DEFAULT_STEPS = [
  // Admin steps
  { role: 'admin', stepOrder: 1, stepKey: 'admin_welcome', title: 'Welcome to GD Genius', description: "GD Genius is your all-in-one warehouse operations platform. Let's take a quick tour of the key features.", targetRoute: '/', actionType: 'read' as const },
  { role: 'admin', stepOrder: 2, stepKey: 'admin_allocation', title: 'Order Allocation', description: 'GD Genius matches open orders to available inventory using FEFO rules. Start by configuring your Extensiv connection.', targetRoute: '/allocation', actionType: 'navigate' as const },
  { role: 'admin', stepOrder: 3, stepKey: 'admin_live_ops', title: 'Live Ops View', description: 'Monitor your warehouse pipeline in real-time — from unallocated orders through QC to ship-ready.', targetRoute: '/live-ops', actionType: 'navigate' as const },
  { role: 'admin', stepOrder: 4, stepKey: 'admin_clients', title: 'Client Profiles', description: 'Manage fulfillment rules, QC requirements, and billing settings for each client.', targetRoute: '/clients', actionType: 'navigate' as const },
  { role: 'admin', stepOrder: 5, stepKey: 'admin_workload', title: 'Workload Planning', description: 'Use predictive workload planning to forecast staffing needs and identify bottlenecks before they happen.', targetRoute: '/workload', actionType: 'navigate' as const },
  { role: 'admin', stepOrder: 6, stepKey: 'admin_settings', title: 'Configure Settings', description: 'Set up your carrier accounts, printer configuration, and SLA rules in Settings.', targetRoute: '/settings', actionType: 'navigate' as const },
  // User (warehouse associate) steps
  { role: 'user', stepOrder: 1, stepKey: 'user_welcome', title: 'Welcome to GD Genius', description: "GD Genius helps you manage your daily warehouse tasks efficiently. Let's get you started.", targetRoute: '/', actionType: 'read' as const },
  { role: 'user', stepOrder: 2, stepKey: 'user_my_shift', title: 'My Shift', description: "Start your shift here. You'll see your assigned tasks, shift timer, and progress for the day.", targetRoute: '/my-shift', actionType: 'navigate' as const },
  { role: 'user', stepOrder: 3, stepKey: 'user_scan_mode', title: 'Scan Mode', description: 'Use Scan Mode for fast barcode scanning during picking and QC. Works on mobile too.', targetRoute: '/scan-mode', actionType: 'navigate' as const },
  { role: 'user', stepOrder: 4, stepKey: 'user_exceptions', title: 'Exceptions Queue', description: 'Report and track order exceptions here — damaged items, missing inventory, or QC failures.', targetRoute: '/exceptions', actionType: 'navigate' as const },
  { role: 'user', stepOrder: 5, stepKey: 'user_pack_ship', title: 'Pack & Ship', description: 'Rate shopping and label printing for outbound shipments. Scan the order barcode to begin.', targetRoute: '/pack-ship', actionType: 'navigate' as const },
];

export const onboardingRouter = router({
  // Get onboarding steps for the current user's role
  getSteps: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const role = (ctx.user as any).role ?? 'user';

      // Ensure default steps are seeded
      for (const step of DEFAULT_STEPS.filter(s => s.role === role)) {
        await db.execute(sql`
          INSERT IGNORE INTO onboarding_steps
            (role, step_order, step_key, title, description, target_route, action_type)
          VALUES
            (${step.role}, ${step.stepOrder}, ${step.stepKey}, ${step.title},
             ${step.description}, ${step.targetRoute}, ${step.actionType})
        `);
      }

      // Get steps with progress
      const rows = await db.execute<any>(sql`
        SELECT
          s.*,
          p.completed_at,
          p.skipped
        FROM onboarding_steps s
        LEFT JOIN onboarding_progress p
          ON p.step_key = s.step_key AND p.user_id = ${ctx.user.id}
        WHERE s.role = ${role}
        ORDER BY s.step_order ASC
      `);

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        stepKey: r.step_key,
        stepOrder: r.step_order,
        title: r.title,
        description: r.description,
        targetRoute: r.target_route,
        targetSelector: r.target_selector,
        actionType: r.action_type,
        completedAt: r.completed_at ? Number(r.completed_at) : null,
        skipped: Boolean(r.skipped),
      }));
    }),

  // Mark a step as complete
  completeStep: protectedProcedure
    .input(z.object({ stepKey: z.string().max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO onboarding_progress (user_id, step_key, completed_at, skipped)
        VALUES (${ctx.user.id}, ${input.stepKey}, ${now}, 0)
        ON DUPLICATE KEY UPDATE completed_at = ${now}, skipped = 0
      `);
      return { success: true };
    }),

  // Skip a step
  skipStep: protectedProcedure
    .input(z.object({ stepKey: z.string().max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.execute(sql`
        INSERT INTO onboarding_progress (user_id, step_key, completed_at, skipped)
        VALUES (${ctx.user.id}, ${input.stepKey}, NULL, 1)
        ON DUPLICATE KEY UPDATE skipped = 1
      `);
      return { success: true };
    }),

  // Reset onboarding (for testing / re-onboarding)
  reset: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      await db.execute(sql`
        DELETE FROM onboarding_progress WHERE user_id = ${ctx.user.id}
      `);
      return { success: true };
    }),

  // Get overall progress summary
  getProgress: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const role = (ctx.user as any).role ?? 'user';
      const totalSteps = DEFAULT_STEPS.filter(s => s.role === role).length;

      const rows = await db.execute<any>(sql`
        SELECT
          COUNT(*) as completed_or_skipped,
          SUM(CASE WHEN completed_at IS NOT NULL AND skipped = 0 THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
        FROM onboarding_progress
        WHERE user_id = ${ctx.user.id}
      `);
      const r = (rows as any[])[0] ?? {};
      const completed = Number(r.completed) || 0;
      const skipped = Number(r.skipped) || 0;
      const isComplete = completed + skipped >= totalSteps;

      return {
        totalSteps,
        completed,
        skipped,
        remaining: Math.max(0, totalSteps - completed - skipped),
        isComplete,
        pct: totalSteps > 0 ? Math.round((completed / totalSteps) * 100) : 0,
      };
    }),
});
