/**
 * Email helper for sending transactional emails via SMTP.
 *
 * Configuration is driven by environment variables:
 *   SMTP_HOST     — SMTP server hostname (required)
 *   SMTP_PORT     — SMTP port, defaults to 587
 *   SMTP_SECURE   — "true" for TLS on port 465, omit/false for STARTTLS
 *   SMTP_USER     — SMTP auth username
 *   SMTP_PASS     — SMTP auth password
 *   SMTP_FROM     — "From" address, e.g. "GD Genius <noreply@example.com>"
 *
 * If SMTP_HOST is not set the helper logs a warning and returns false so the
 * rest of the application continues to work without email configured.
 */
import nodemailer from "nodemailer";

export interface EmailPayload {
  to: string;
  /** Optional CC recipients (comma-separated string or array) */
  cc?: string | string[];
  subject: string;
  /** Plain-text fallback */
  text: string;
  /** Optional HTML body */
  html?: string;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

/**
 * Send a single email.
 * Returns `true` on success, `false` if SMTP is not configured or the send
 * fails (errors are logged but not re-thrown so callers stay non-blocking).
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    console.warn(
      "[Email] SMTP_HOST is not configured — email not sent to",
      payload.to
    );
    return false;
  }

  const from =
    process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "GD Genius <noreply@gdgenius.app>";

  try {
    await transport.sendMail({
      from,
      to: payload.to,
      ...(payload.cc ? { cc: payload.cc } : {}),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    console.log(`[Email] Sent "${payload.subject}" to ${payload.to}`);
    return true;
  } catch (err) {
    console.error("[Email] Failed to send email:", err);
    return false;
  }
}

/**
 * Build a formatted HTML email body for a packaging reorder request.
 */
export function buildReorderEmailHtml(opts: {
  itemName: string;
  category: string;
  requestedQty: number;
  onHandQty: number;
  minStockLevel: number;
  weeklyConsumption: number | null;
  suggestedQty: number;
  requesterName: string;
  notes?: string | null;
}): { subject: string; text: string; html: string } {
  const {
    itemName,
    category,
    requestedQty,
    onHandQty,
    minStockLevel,
    weeklyConsumption,
    suggestedQty,
    requesterName,
    notes,
  } = opts;

  const daysLeft =
    weeklyConsumption && weeklyConsumption > 0
      ? Math.floor((onHandQty / weeklyConsumption) * 7)
      : null;

  const subject = `📦 Packaging Reorder Request — ${itemName} (${requestedQty} units)`;

  const text = [
    `Packaging Reorder Request`,
    ``,
    `Item:       ${itemName}`,
    `Category:   ${category}`,
    `Requested:  ${requestedQty} units`,
    `Suggested:  ${suggestedQty} units (4-week replenishment)`,
    `On Hand:    ${onHandQty}`,
    `Min Stock:  ${minStockLevel}`,
    weeklyConsumption
      ? `Weekly Use: ${weeklyConsumption} units/wk`
      : null,
    daysLeft !== null ? `Days Left:  ~${daysLeft} days` : null,
    ``,
    `Requested by: ${requesterName}`,
    notes ? `Notes: ${notes}` : null,
    ``,
    `Please action this request in GD Genius.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const urgencyColor =
    daysLeft !== null
      ? daysLeft < 7
        ? "#ef4444"
        : daysLeft < 14
        ? "#f59e0b"
        : "#22c55e"
      : "#6b7280";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;">📦 Packaging Reorder Request</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 4px;font-size:22px;color:#0f172a;">${itemName}</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:14px;text-transform:capitalize;">${category}</p>

            <!-- Key figures -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="width:50%;padding-right:8px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#0f172a;">${requestedQty}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">Units Requested</div>
                  </div>
                </td>
                <td style="width:50%;padding-left:8px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#0f172a;">${onHandQty}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">On Hand</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f8fafc;">
                <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Suggested Qty (4-wk replenishment)</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right;">${suggestedQty} units</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Min Stock Level</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right;">${minStockLevel}</td>
              </tr>
              ${
                weeklyConsumption
                  ? `<tr>
                <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Weekly Consumption</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right;">${weeklyConsumption} units/wk</td>
              </tr>`
                  : ""
              }
              ${
                daysLeft !== null
                  ? `<tr>
                <td style="padding:10px 16px;font-size:13px;color:#64748b;">Days of Stock Remaining</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:700;color:${urgencyColor};text-align:right;">~${daysLeft} days</td>
              </tr>`
                  : ""
              }
            </table>

            <!-- Requester -->
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
              <strong style="color:#0f172a;">Requested by:</strong> ${requesterName}
            </p>
            ${
              notes
                ? `<p style="margin:0 0 24px;font-size:13px;color:#64748b;"><strong style="color:#0f172a;">Notes:</strong> ${notes}</p>`
                : ""
            }

            <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
              Please log in to GD Genius to update the request status once the order has been placed.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">GD Genius — Packaging Inventory Module</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
