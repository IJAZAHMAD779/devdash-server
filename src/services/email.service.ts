import { Resend } from "resend";

export interface DigestStats {
  completedTasks: { id: string; title: string; completedAt: Date | null }[];
  pendingTasksCount: number;
  activeProjects: { id: string; title: string; status: string }[];
  newSnippetsCount: number;
  newComponentsCount: number;
  weekStart: Date;
  weekEnd: Date;
}

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_test_mock_key" || apiKey.startsWith("placeholder")) {
    return null;
  }
  return new Resend(apiKey);
};

/**
 * Builds the Linear-styled dark-mode HTML email template for the Weekly Developer Digest
 */
export function buildWeeklyDigestHtml(
  userName: string,
  stats: DigestStats
): string {
  const completedTasksHtml =
    stats.completedTasks.length > 0
      ? stats.completedTasks
          .map(
            (t) => `
          <li style="margin-bottom: 8px; color: #d0d6e0; font-size: 14px;">
            <span style="color: #4ade80; margin-right: 6px;">✓</span>
            <strong style="color: #f7f8f8;">${t.title}</strong>
          </li>`
          )
          .join("")
      : `<li style="color: #8a8f98; font-size: 13px; font-style: italic;">No tasks completed this week</li>`;

  const activeProjectsHtml =
    stats.activeProjects.length > 0
      ? stats.activeProjects
          .map(
            (p) => `
          <div style="background: #141516; border: 1px solid #23252a; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
            <div style="color: #f7f8f8; font-weight: 600; font-size: 14px;">${p.title}</div>
            <div style="color: #5e6ad2; font-size: 11px; text-transform: uppercase; font-family: monospace; margin-top: 2px;">${p.status}</div>
          </div>`
          )
          .join("")
      : `<div style="color: #8a8f98; font-size: 13px; font-style: italic;">No active projects</div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your Weekly DevDash Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #010102; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f7f8f8;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 20px;">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 36px; height: 36px; background: #5e6ad2; border-radius: 8px; line-height: 36px; text-align: center; color: #ffffff; font-weight: bold; font-size: 18px; margin-bottom: 12px;">D</div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.6px; color: #f7f8f8;">Weekly Developer Digest</h1>
      <p style="margin: 6px 0 0; color: #8a8f98; font-size: 13px;">Your workspace velocity and engineering highlights</p>
    </div>

    <!-- Greeting Card -->
    <div style="background: #0f1011; border: 1px solid #23252a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #d0d6e0; line-height: 1.5;">
        Hey <strong style="color: #f7f8f8;">${userName}</strong>, here is your weekly summary of work shipped, active repos, and code assets saved to DevDash.
      </p>

      <!-- Stat Badges Row -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="width: 33%; text-align: center; background: #141516; border: 1px solid #23252a; border-radius: 8px; padding: 14px 8px;">
            <div style="font-size: 24px; font-weight: 700; color: #4ade80;">${stats.completedTasks.length}</div>
            <div style="font-size: 11px; color: #8a8f98; text-transform: uppercase; margin-top: 4px;">Shipped Tasks</div>
          </td>
          <td style="width: 4px;"></td>
          <td style="width: 33%; text-align: center; background: #141516; border: 1px solid #23252a; border-radius: 8px; padding: 14px 8px;">
            <div style="font-size: 24px; font-weight: 700; color: #5e6ad2;">${stats.newSnippetsCount + stats.newComponentsCount}</div>
            <div style="font-size: 11px; color: #8a8f98; text-transform: uppercase; margin-top: 4px;">Vault Assets</div>
          </td>
          <td style="width: 4px;"></td>
          <td style="width: 33%; text-align: center; background: #141516; border: 1px solid #23252a; border-radius: 8px; padding: 14px 8px;">
            <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${stats.pendingTasksCount}</div>
            <div style="font-size: 11px; color: #8a8f98; text-transform: uppercase; margin-top: 4px;">In Flight</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Completed Tasks Section -->
    <div style="background: #0f1011; border: 1px solid #23252a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #f7f8f8; letter-spacing: -0.3px;">
        Tasks Completed This Week (${stats.completedTasks.length})
      </h2>
      <ul style="margin: 0; padding-left: 0; list-style: none;">
        ${completedTasksHtml}
      </ul>
    </div>

    <!-- Active Projects Section -->
    <div style="background: #0f1011; border: 1px solid #23252a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #f7f8f8; letter-spacing: -0.3px;">
        Active Projects Focus
      </h2>
      ${activeProjectsHtml}
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 36px 0;">
      <a href="${process.env.CLIENT_URL || "http://localhost:3000"}" style="display: inline-block; background-color: #5e6ad2; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; letter-spacing: -0.1px;">
        Open DevDash Workspace
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; font-size: 11px; color: #62656d; border-top: 1px solid #18191a; padding-top: 20px;">
      <p style="margin: 0 0 6px;">Sent with ♥ by DevDash • Personal Developer Workspace</p>
      <p style="margin: 0;">Decoupled Next.js + Express + Supabase + Clerk + Resend</p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Dispatches the weekly digest email via Resend
 */
export async function sendWeeklyDigestEmail(
  toEmail: string,
  userName: string,
  stats: DigestStats
): Promise<{ success: boolean; id?: string; mode: "live" | "simulated" }> {
  const resend = getResendClient();
  const html = buildWeeklyDigestHtml(userName, stats);

  if (!resend) {
    console.log(
      `[Resend Simulated] Weekly digest generated for ${toEmail} (${userName}). No live RESEND_API_KEY configured.`
    );
    return {
      success: true,
      id: `simulated-${Date.now()}`,
      mode: "simulated",
    };
  }

  try {
    const fromAddress =
      process.env.RESEND_FROM_EMAIL || "DevDash <onboarding@resend.dev>";
    const result = await resend.emails.send({
      from: fromAddress,
      to: toEmail,
      subject: `Your Weekly DevDash Digest: ${stats.completedTasks.length} tasks shipped`,
      html,
    });

    return {
      success: true,
      id: result.data?.id,
      mode: "live",
    };
  } catch (err) {
    console.error("[Resend Error] Failed to send weekly digest email:", err);
    throw err;
  }
}
