import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Transfer: any = sequelize.define('Transfer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  settlement_batch_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'settlement_batches',
      key: 'id',
    },
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
  razorpay_transfer_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  linked_account_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'linked_accounts',
      key: 'id',
    },
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR',
  },
  status: {
    type: DataTypes.ENUM('created', 'pending', 'processed', 'settled', 'failed', 'reversed'),
    defaultValue: 'created',
  },
  source_type: {
    type: DataTypes.ENUM('direct', 'payment', 'order'),
    defaultValue: 'direct',
  },
  razorpay_payment_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  error_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  idempotency_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'transfers',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['razorpay_transfer_id'], unique: true },
    { fields: ['idempotency_key'], unique: true },
    { fields: ['settlement_batch_id'] },
    { fields: ['salon_id', 'status'] },
    { fields: ['status', 'created_at'] },
  ],
});

export default Transfer;
