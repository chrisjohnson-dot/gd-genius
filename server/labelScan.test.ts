import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getLabelScanSettings: vi.fn().mockResolvedValue({
      id: 1,
      printerIp: "192.168.1.50",
      printerPort: 9100,
      gs1Prefix: "0614141",
      labelFolderPath: "\\\\server\\labels",
    }),
    upsertLabelScanSettings: vi.fn().mockResolvedValue(undefined),
    createLabelFile: vi.fn().mockResolvedValue(42),
    getLabelFileByBarcode: vi.fn().mockResolvedValue(null),
    getLabelFileByBarcodeScoped: vi.fn().mockResolvedValue(null),
    getActiveLabelScanSession: vi.fn().mockResolvedValue(null),
    listLabelFiles: vi.fn().mockResolvedValue([]),
    deleteLabelFile: vi.fn().mockResolvedValue(undefined),
    createLabelScanSession: vi.fn().mockResolvedValue(10),
    getLabelScanSessionById: vi.fn().mockResolvedValue({
      id: 10,
      orderRef: "PO-4821",
      clientName: "Walmart",
      expectedCartons: 12,
      status: "active",
      printerIp: null,
      printerPort: null,
      scannedCount: 0,
      dispatchedCount: 0,
      exceptionCount: 0,
      createdBy: "Test User",
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    listLabelScanSessions: vi.fn().mockResolvedValue([]),
    updateLabelScanSession: vi.fn().mockResolvedValue(undefined),
    createLabelScanCarton: vi.fn().mockResolvedValue(100),
    getLabelScanCartonsBySession: vi.fn().mockResolvedValue([]),
    updateLabelScanCarton: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "label-files/test.zpl", url: "https://cdn.example.com/test.zpl" }),
}));

import {
  getLabelScanSettings,
  upsertLabelScanSettings,
  createLabelFile,
  getLabelFileByBarcode,
  getLabelFileByBarcodeScoped,
  getActiveLabelScanSession,
  listLabelFiles,
  deleteLabelFile,
  createLabelScanSession,
  getLabelScanSessionById,
  listLabelScanSessions,
  updateLabelScanSession,
  createLabelScanCarton,
  getLabelScanCartonsBySession,
  updateLabelScanCarton,
} from "./db";

// ─── Settings ─────────────────────────────────────────────────────────────────
describe("LabelScan Settings", () => {
  it("returns settings from DB", async () => {
    const settings = await getLabelScanSettings();
    expect(settings).not.toBeNull();
    expect(settings?.printerIp).toBe("192.168.1.50");
    expect(settings?.printerPort).toBe(9100);
    expect(settings?.gs1Prefix).toBe("0614141");
  });

  it("calls upsertLabelScanSettings with provided fields", async () => {
    await upsertLabelScanSettings({ printerIp: "10.0.0.5", printerPort: 9100 });
    expect(upsertLabelScanSettings).toHaveBeenCalledWith({ printerIp: "10.0.0.5", printerPort: 9100 });
  });
});

// ─── Label Files ──────────────────────────────────────────────────────────────
describe("LabelScan Label Files", () => {
  it("creates a label file and returns an id", async () => {
    const id = await createLabelFile({
      barcode: "012345678901",
      filename: "012345678901.zpl",
      s3Key: "label-files/test.zpl",
      s3Url: "https://cdn.example.com/test.zpl",
      batchName: "Walmart-PO-4821",
      clientName: "Walmart",
      labelType: "ucc128",
      uploadedBy: "Test User",
    });
    expect(id).toBe(42);
  });

  it("returns null when no label file matches barcode", async () => {
    const file = await getLabelFileByBarcode("999999999999");
    expect(file).toBeNull();
  });

  it("returns a label file when barcode matches", async () => {
    vi.mocked(getLabelFileByBarcode).mockResolvedValueOnce({
      id: 42,
      barcode: "012345678901",
      filename: "012345678901.zpl",
      s3Key: "label-files/test.zpl",
      s3Url: "https://cdn.example.com/test.zpl",
      batchName: "Walmart-PO-4821",
      clientName: "Walmart",
      labelType: "ucc128",
      uploadedBy: "Test User",
      uploadedAt: new Date(),
    });
    const file = await getLabelFileByBarcode("012345678901");
    expect(file).not.toBeNull();
    expect(file?.barcode).toBe("012345678901");
    expect(file?.labelType).toBe("ucc128");
  });

  it("lists all label files", async () => {
    vi.mocked(listLabelFiles).mockResolvedValueOnce([
      {
        id: 42,
        barcode: "012345678901",
        filename: "012345678901.zpl",
        s3Key: "label-files/test.zpl",
        s3Url: "https://cdn.example.com/test.zpl",
        batchName: "Walmart-PO-4821",
        clientName: "Walmart",
        labelType: "ucc128",
        uploadedBy: "Test User",
        uploadedAt: new Date(),
      },
    ]);
    const files = await listLabelFiles();
    expect(files).toHaveLength(1);
    expect(files[0].barcode).toBe("012345678901");
  });

  it("deletes a label file by id", async () => {
    await deleteLabelFile(42);
    expect(deleteLabelFile).toHaveBeenCalledWith(42);
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
describe("LabelScan Sessions", () => {
  it("creates a session and returns an id", async () => {
    const id = await createLabelScanSession({
      orderRef: "PO-4821",
      clientName: "Walmart",
      expectedCartons: 12,
      status: "active",
      printerIp: null,
      printerPort: null,
      scannedCount: 0,
      dispatchedCount: 0,
      exceptionCount: 0,
      createdBy: "Test User",
    });
    expect(id).toBe(10);
  });

  it("retrieves a session by id", async () => {
    const session = await getLabelScanSessionById(10);
    expect(session).not.toBeNull();
    expect(session?.orderRef).toBe("PO-4821");
    expect(session?.status).toBe("active");
  });

  it("returns null for unknown session id", async () => {
    vi.mocked(getLabelScanSessionById).mockResolvedValueOnce(null);
    const session = await getLabelScanSessionById(9999);
    expect(session).toBeNull();
  });

  it("updates session status to complete", async () => {
    await updateLabelScanSession(10, { status: "complete", completedAt: new Date() });
    expect(updateLabelScanSession).toHaveBeenCalledWith(10, expect.objectContaining({ status: "complete" }));
  });
});

// ─── Cartons ──────────────────────────────────────────────────────────────────
describe("LabelScan Cartons", () => {
  it("creates a carton record on successful scan", async () => {
    const id = await createLabelScanCarton({
      sessionId: 10,
      barcode: "012345678901",
      labelFileId: 42,
      dispatched: true,
      dispatchedAt: new Date(),
      hasException: false,
      qcItemCount: 24,
      qcNotes: null,
    });
    expect(id).toBe(100);
  });

  it("creates an exception carton when no label found", async () => {
    const id = await createLabelScanCarton({
      sessionId: 10,
      barcode: "999999999999",
      labelFileId: null,
      dispatched: false,
      hasException: true,
      exceptionReason: "no_label",
      exceptionDetail: 'No label file found for barcode "999999999999".',
      qcItemCount: null,
      qcNotes: null,
    });
    expect(id).toBe(100);
    expect(createLabelScanCarton).toHaveBeenCalledWith(
      expect.objectContaining({ hasException: true, exceptionReason: "no_label" })
    );
  });

  it("retrieves cartons for a session", async () => {
    vi.mocked(getLabelScanCartonsBySession).mockResolvedValueOnce([
      {
        id: 100,
        sessionId: 10,
        barcode: "012345678901",
        labelFileId: 42,
        dispatched: true,
        dispatchedAt: new Date(),
        hasException: false,
        exceptionReason: null,
        exceptionDetail: null,
        exceptionResolvedBy: null,
        exceptionResolvedAt: null,
        qcItemCount: 24,
        qcPhotos: null,
        qcNotes: null,
        scannedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const cartons = await getLabelScanCartonsBySession(10);
    expect(cartons).toHaveLength(1);
    expect(cartons[0].dispatched).toBe(true);
    expect(cartons[0].hasException).toBe(false);
  });

  it("resolves an exception by updating carton and session", async () => {
    await updateLabelScanCarton(100, {
      exceptionResolvedBy: "Supervisor",
      exceptionResolvedAt: new Date(),
    });
    await updateLabelScanSession(10, { status: "active" });
    expect(updateLabelScanCarton).toHaveBeenCalledWith(100, expect.objectContaining({ exceptionResolvedBy: "Supervisor" }));
    expect(updateLabelScanSession).toHaveBeenCalledWith(10, { status: "active" });
  });
});
