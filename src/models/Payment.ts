import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Payment: any = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'bookings',
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
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
  razorpay_order_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  razorpay_payment_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  razorpay_signature: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'INR',
  },
  payment_type: {
    type: DataTypes.ENUM('full', 'token', 'remaining'),
    defaultValue: 'full',
  },
  status: {
    type: DataTypes.ENUM('created', 'authorized', 'captured', 'failed', 'refunded'),
    defaultValue: 'created',
  },
  method: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  refund_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  refund_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Razorpay Route additional fields
  razorpay_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  razorpay_tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  captured_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refund_status: {
    type: DataTypes.ENUM('none', 'partial', 'full'),
    defaultValue: 'none',
  },
  notes: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['booking_id'] },
    { fields: ['razorpay_order_id'], unique: true },
  ],
});

export default Payment;
