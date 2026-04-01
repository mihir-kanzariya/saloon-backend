/**
 * One-off script: reconcile wallet balances from existing SalonEarning records.
 * Credits the wallet for each earning that doesn't have a corresponding ledger entry.
 *
 * Usage: npx tsx src/scripts/reconcile-wallets.ts
 */
import { connectDB, sequelize } from '../config/database';
import { WalletService } from '../services/wallet.service';
import SalonEarning from '../models/SalonEarning';
import WalletLedger from '../models/WalletLedger';
import Wallet from '../models/Wallet';
import { Op } from 'sequelize';

// Register all models so associations work
import '../models';

async function reconcile() {
  await connectDB();
  console.log('Connected to database');

  // Find all earnings that don't have a wallet ledger entry
  const earnings = await SalonEarning.findAll({
    where: { status: { [Op.in]: ['pending', 'ready_for_settlement', 'settled'] } },
    order: [['created_at', 'ASC']],
  });

  console.log(`Found ${earnings.length} earnings to check`);

  let credited = 0;
  for (const earning of earnings) {
    // Check if wallet ledger already has an entry for this booking
    const existing = await WalletLedger.findOne({
      where: {
        salon_id: earning.salon_id,
        reference_type: 'booking',
        reference_id: earning.booking_id,
        type: 'earning_credit',
      },
    });

    if (existing) continue;

    const netAmount = parseFloat(earning.net_amount);
    if (netAmount <= 0) continue;

    try {
      await WalletService.creditEarning({
        salonId: earning.salon_id,
        amount: netAmount,
        bookingId: earning.booking_id,
        description: `Reconciled earning from booking`,
      });
      credited++;
      console.log(`  Credited ₹${netAmount} to salon ${earning.salon_id} (booking: ${earning.booking_id})`);
    } catch (err: any) {
      console.error(`  Failed for earning ${earning.id}:`, err.message);
    }
  }

  console.log(`\nReconciliation complete: ${credited} wallets credited`);

  // Show wallet summaries
  const wallets = await Wallet.findAll();
  for (const w of wallets) {
    console.log(`  Salon ${w.salon_id}: total=₹${w.total_balance}, available=₹${w.available_balance}, held=₹${w.held_balance}`);
  }

  await sequelize.close();
}

reconcile().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
