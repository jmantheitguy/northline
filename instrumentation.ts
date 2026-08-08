export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderWorker } = await import("./lib/reminder-worker");
    startReminderWorker();
  }
}
