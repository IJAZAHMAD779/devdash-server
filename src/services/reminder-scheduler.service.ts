import { prisma } from "../lib/prisma";
import { sendReminderEmail } from "./email.service";

let schedulerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Checks database for due reminders (remindAt <= now and isSent = false)
 * and dispatches reminder notification emails via Resend.
 */
export async function processDueReminders(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  try {
    const now = new Date();
    const dueReminders: any[] = await (prisma.reminder.findMany as any)({
      where: {
        isSent: false,
        failureReason: null,
        remindAt: { lte: now },
      },
      include: {
        user: true,
        task: true,
      },
      take: 20, // Process in safe batches
    });

    if (dueReminders.length === 0) {
      return 0;
    }

    console.log(`[ReminderScheduler] Found ${dueReminders.length} due reminder(s) to process.`);

    for (const reminder of dueReminders) {
      const recipientEmail = reminder.user?.email;

      if (!recipientEmail || recipientEmail.endsWith("@devdash.local")) {
        console.warn(
          `[ReminderScheduler] Skipping reminder "${reminder.title}" (ID: ${reminder.id}): No valid recipient email found (stored: ${recipientEmail})`
        );
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            isSent: false,
            failureReason: "No real recipient email found on account. Please set a valid email.",
          } as any,
        });
        continue;
      }

      try {
        const fullDescription = [
          reminder.description,
          reminder.task ? `Linked Task: ${reminder.task.title} [Status: ${reminder.task.status}]` : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = await sendReminderEmail(
          recipientEmail,
          reminder.user?.name || "Developer",
          reminder.title,
          fullDescription || null,
          reminder.remindAt
        );

        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            isSent: true,
            sentAt: new Date(),
            failureReason: null,
          } as any,
        });

        console.log(
          `[ReminderScheduler] Successfully dispatched reminder "${reminder.title}" to ${recipientEmail} (mode: ${result.mode}, ID: ${result.id})`
        );
      } catch (sendErr: any) {
        const errMsg = sendErr?.message || String(sendErr);
        console.error(
          `[ReminderScheduler] Failed to dispatch reminder "${reminder.title}" to ${recipientEmail}:`,
          errMsg
        );
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            isSent: false,
            failureReason: errMsg.substring(0, 500),
          } as any,
        });
      }
    }

    return dueReminders.length;
  } catch (error) {
    console.error("[ReminderScheduler] Error checking due reminders:", error);
    return 0;
  } finally {
    isProcessing = false;
  }
}

/**
 * Initializes the background reminder interval checking every 30 seconds
 */
export function initReminderScheduler(intervalMs = 30000): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[ReminderScheduler] Background reminder scheduler initialized (interval: ${intervalMs / 1000}s).`);
  
  // Run an immediate check on startup
  processDueReminders().catch((err) =>
    console.error("[ReminderScheduler] Startup check error:", err)
  );

  // Recurring interval
  schedulerInterval = setInterval(() => {
    processDueReminders().catch((err) =>
      console.error("[ReminderScheduler] Interval tick error:", err)
    );
  }, intervalMs);
}

export function stopReminderScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
