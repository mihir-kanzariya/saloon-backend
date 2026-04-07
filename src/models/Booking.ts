import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Booking: any = sequelize.define('Booking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  tx_id: {
    type: DataTypes.STRING(25),
    allowNull: true,
    unique: true,
  },
  customer_id: {
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
  stylist_member_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'salon_members',
      key: 'id',
    },
  },
  booking_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  start_time: {
    type: DataTypes.STRING(5),
    allowNull: false,
  },
  end_time: {
    type: DataTypes.STRING(5),
    allowNull: false,
  },
  total_duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  promo_code_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'promo_codes',
      key: 'id',
    },
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  platform_fee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  payment_mode: {
    type: DataTypes.ENUM('online', 'pay_at_salon', 'token'),
    defaultValue: 'pay_at_salon',
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'token_paid', 'paid', 'refunded', 'partially_refunded'),
    defaultValue: 'pending',
  },
  token_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('awaiting_payment', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'),
    defaultValue: 'pending',
  },
  payment_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancelled_by: {
    type: DataTypes.ENUM('customer', 'salon'),
    allowNull: true,
  },
  cancellation_reason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  is_auto_assigned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  customer_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  salon_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Smart slot tracking
  slot_type: {
    type: DataTypes.STRING(20),
    defaultValue: 'regular',
  },
  smart_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  // Settlement tracking fields
  settlement_status: {
    type: DataTypes.ENUM('not_applicable', 'pending_settlement', 'settled', 'refund_adjusted'),
    defaultValue: 'not_applicable',
  },
  settlement_batch_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'settlement_batches',
      key: 'id',
    },
  },
  settled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'bookings',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['customer_id', 'status'] },
    { fields: ['salon_id', 'booking_date', 'status'] },
    { fields: ['stylist_member_id', 'booking_date', 'status'] },
    { fields: ['booking_number'], unique: true },
    { fields: ['settlement_status', 'payment_mode', 'payment_status'] },
    { fields: ['status', 'booking_date'] },
  ],
});

export default Booking;
