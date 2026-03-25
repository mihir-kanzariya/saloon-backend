import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const SettlementBatch: any = sequelize.define('SettlementBatch', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  batch_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'partially_failed', 'failed'),
    defaultValue: 'pending',
  },
  total_salons: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_bookings: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_gross_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_commission: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_net_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_refund_adjustments: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error_log: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
}, {
  tableName: 'settlement_batches',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['batch_number'], unique: true },
    { fields: ['status'] },
    { fields: ['period_start', 'period_end'] },
  ],
});

export default SettlementBatch;
