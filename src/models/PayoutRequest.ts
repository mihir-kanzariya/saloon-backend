import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const PayoutRequest: any = sequelize.define('PayoutRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('incentive', 'bonus', 'refund_adjustment', 'manual'),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR',
  },
  razorpay_payout_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  razorpay_fund_account_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'queued', 'processing', 'processed', 'reversed', 'cancelled', 'failed'),
    defaultValue: 'pending',
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  initiated_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  idempotency_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  error_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'payout_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id', 'status'] },
    { fields: ['razorpay_payout_id'], unique: true },
    { fields: ['idempotency_key'], unique: true },
  ],
});

export default PayoutRequest;
