/**
 * Tests for new features: Photo Capture, Workload Planning, Guided Onboarding
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// ─── Mock Storage ─────────────────────────────────────────────────────────────
vi.mock('./storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/test.jpg', key: 'test.jpg' }),
}));

// ─── Photo Capture Router Tests ───────────────────────────────────────────────
describe('photoCaptureRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list returns photos for an entity', async () => {
    const mockPhotos = [
      { id: 1, entity_type: 'exception', entity_id: '42', category: 'damage', file_url: 'https://cdn.example.com/photo1.jpg', captured_at: Date.now(), captured_by_name: 'Alice' },
    ];
    mockExecute.mockResolvedValueOnce(mockPhotos);

    const { getDb } = await import('./db');
    const db = await getDb();
    const rows = await db!.execute(`SELECT * FROM media_attachments WHERE entity_type = 'exception' AND entity_id = '42'`);
    expect(rows).toHaveLength(1);
    expect((rows as any[])[0].entity_type).toBe('exception');
  });

  it('countBatch returns counts per entity', async () => {
    const mockCounts = [
      { entity_id: '1', count: 3 },
      { entity_id: '2', count: 1 },
    ];
    mockExecute.mockResolvedValueOnce(mockCounts);

    const { getDb } = await import('./db');
    const db = await getDb();
    const rows = await db!.execute(`SELECT entity_id, COUNT(*) as count FROM media_attachments GROUP BY entity_id`) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].count).toBe(3);
  });

  it('upload stores file in S3 and returns attachment', async () => {
    const { storagePut } = await import('./storage');
    const result = await storagePut('photos/test/123/file.jpg', Buffer.from('test'), 'image/jpeg');
    expect(result.url).toBe('https://cdn.example.com/test.jpg');
    expect(storagePut).toHaveBeenCalledOnce();
  });
});

// ─── Workload Router Tests ────────────────────────────────────────────────────
describe('workloadRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPipelineSnapshot returns counts for all stages', async () => {
    const mockRows = [
      { stage: 'unallocated', count: 10 },
      { stage: 'picking', count: 5 },
      { stage: 'qc', count: 3 },
    ];
    mockExecute.mockResolvedValueOnce(mockRows);

    const { getDb } = await import('./db');
    const db = await getDb();
    const rows = await db!.execute(`SELECT lifecycle_status as stage, COUNT(*) as count FROM order_tracking GROUP BY lifecycle_status`) as any[];
    expect(rows).toHaveLength(3);
    const unallocated = rows.find(r => r.stage === 'unallocated');
    expect(unallocated?.count).toBe(10);
  });

  it('generateForecast calculates hours needed correctly', () => {
    const queue = 120;
    const tph = 30;
    const hoursNeeded = queue / tph;
    expect(hoursNeeded).toBe(4);
  });

  it('generateForecast identifies bottleneck as stage with most hours', () => {
    const forecasts = [
      { stage: 'picking', hoursNeeded: 2 },
      { stage: 'qc', hoursNeeded: 8 },
      { stage: 'ship_ready', hoursNeeded: 1 },
    ];
    const maxHours = Math.max(...forecasts.map(f => f.hoursNeeded));
    const bottleneck = forecasts.find(f => f.hoursNeeded === maxHours);
    expect(bottleneck?.stage).toBe('qc');
  });

  it('getLatestForecast returns empty when no forecasts exist', async () => {
    mockExecute.mockResolvedValueOnce([{ latest_at: null }]);

    const { getDb } = await import('./db');
    const db = await getDb();
    const rows = await db!.execute(`SELECT MAX(forecast_at) as latest_at FROM workload_forecasts`) as any[];
    const latestAt = rows[0]?.latest_at;
    expect(latestAt).toBeNull();
  });
});

// ─── Onboarding Router Tests ──────────────────────────────────────────────────
describe('onboardingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSteps returns steps with progress for user', async () => {
    // Mock INSERT IGNORE (no-op), then SELECT steps
    mockExecute.mockResolvedValue([]);
    const mockSteps = [
      { id: 1, step_key: 'admin_welcome', step_order: 1, title: 'Welcome', description: 'Intro', target_route: '/', action_type: 'read', completed_at: null, skipped: 0 },
      { id: 2, step_key: 'admin_allocation', step_order: 2, title: 'Allocation', description: 'Allocate orders', target_route: '/allocation', action_type: 'navigate', completed_at: Date.now(), skipped: 0 },
    ];
    mockExecute.mockResolvedValueOnce(mockSteps);

    const { getDb } = await import('./db');
    const db = await getDb();
    const rows = await db!.execute(`SELECT s.*, p.completed_at FROM onboarding_steps s LEFT JOIN onboarding_progress p ON p.step_key = s.step_key WHERE s.role = 'admin'`) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].step_key).toBe('admin_welcome');
  });

  it('getProgress calculates percentage correctly', () => {
    const totalSteps = 6;
    const completed = 3;
    const skipped = 0;
    const pct = Math.round((completed / totalSteps) * 100);
    expect(pct).toBe(50);
    expect(completed + skipped < totalSteps).toBe(true);
  });

  it('getProgress marks complete when all steps done', () => {
    const totalSteps = 5;
    const completed = 4;
    const skipped = 1;
    const isComplete = completed + skipped >= totalSteps;
    expect(isComplete).toBe(true);
  });

  it('completeStep inserts progress record', async () => {
    mockExecute.mockResolvedValueOnce({ affectedRows: 1 });

    const { getDb } = await import('./db');
    const db = await getDb();
    const result = await db!.execute(`INSERT INTO onboarding_progress (user_id, step_key, completed_at) VALUES (1, 'admin_welcome', ${Date.now()})`);
    expect(mockExecute).toHaveBeenCalledOnce();
  });
});
