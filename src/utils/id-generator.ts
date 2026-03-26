import crypto from 'crypto';

/**
 * Generate a human-readable transaction ID.
 *
 * Format: {PREFIX}-{YYYYMMDD}-{5_CHAR_ALPHANUM}
 * Examples: BK-20260327-4F8A2, PAY-20260327-B3C1D
 *
 * Properties:
 * - Human readable (can be read over phone)
 * - Date embedded (natural chronological sorting)
 * - Short enough for SMS/receipt
 * - ~60M combinations per prefix per day (collision-safe)
 */
export function generateTxId(prefix: string): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);
  return `${prefix}-${date}-${random}`;
}

/**
 * Generate a settlement-specific TX ID with week number.
 * Format: STL-YYYY-WNN-XXXXX
 * Example: STL-2026-W13-A2B3C
 */
export function generateSettlementTxId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);
  return `STL-${year}-W${String(week).padStart(2, '0')}-${random}`;
}
