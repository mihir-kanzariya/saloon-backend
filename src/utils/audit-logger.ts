/**
 * Structured audit logger for payment-related events.
 * Logs JSON-formatted events for payment state transitions, settlements, and refunds.
 * In production, these logs should be piped to a log aggregation service.
 */
export function auditLog(event: string, data: Record<string, any>): void {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log(`[AUDIT] ${JSON.stringify(entry)}`);
}
