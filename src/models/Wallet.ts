import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Wallet: any = sequelize.define('Wallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: { model: 'salons', key: 'id' },
  },
  total_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: 'Total balance including held funds',
  },
  available_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: 'Withdrawable balance (past 7-day hold)',
  },
  held_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: 'Funds within 7-day hold period',
  },
  total_withdrawn: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: 'Lifetime withdrawn amount',
  },
  total_earned: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: 'Lifetime earned amount',
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR',
  },
  last_reconciled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'wallets',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id'], unique: true },
  ],
});

export default Wallet;
