import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { generateTxId } from '../utils/id-generator';

const WalletLedger: any = sequelize.define('WalletLedger', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tx_id: {
    type: DataTypes.STRING(25),
    allowNull: false,
    unique: true,
    defaultValue: () => generateTxId('TXN'),
  },
  wallet_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'wallets', key: 'id' },
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'salons', key: 'id' },
  },
  type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    comment: 'earning_credit, withdrawal_debit, refund_debit, commission_debit, adjustment_credit, adjustment_debit, hold_release',
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    comment: 'Always positive. Direction determined by type (credit/debit)',
  },
  direction: {
    type: DataTypes.ENUM('credit', 'debit'),
    allowNull: false,
  },
  balance_after: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    comment: 'Wallet available_balance after this transaction',
  },
  reference_type: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: 'booking, withdrawal, refund, settlement, adjustment',
  },
  reference_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  hold_until: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'If set, funds are held until this date',
  },
  is_held: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if funds are still in hold period',
  },
}, {
  tableName: 'wallet_ledger',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['tx_id'], unique: true },
    { fields: ['wallet_id', 'created_at'] },
    { fields: ['salon_id', 'type'] },
    { fields: ['reference_type', 'reference_id'] },
    { fields: ['is_held', 'hold_until'] },
  ],
});

export default WalletLedger;
