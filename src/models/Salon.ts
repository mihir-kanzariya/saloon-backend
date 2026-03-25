import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Salon: any = sequelize.define('Salon', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  pincode: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false,
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false,
  },
  gender_type: {
    type: DataTypes.ENUM('men', 'women', 'unisex'),
    defaultValue: 'unisex',
  },
  cover_image: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  gallery: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  amenities: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  operating_hours: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      monday: { open: '09:00', close: '21:00', is_open: true },
      tuesday: { open: '09:00', close: '21:00', is_open: true },
      wednesday: { open: '09:00', close: '21:00', is_open: true },
      thursday: { open: '09:00', close: '21:00', is_open: true },
      friday: { open: '09:00', close: '21:00', is_open: true },
      saturday: { open: '09:00', close: '21:00', is_open: true },
      sunday: { open: '09:00', close: '21:00', is_open: false },
    },
  },
  holidays: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  booking_settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      advance_booking_days: 15,
      slot_duration_minutes: 15,
      buffer_between_bookings_minutes: 5,
      auto_accept_bookings: false,
      cancellation_policy_hours: 2,
      allow_reschedule: true,
      reschedule_policy_hours: 2,
      require_prepayment: false,
      token_amount: 0,
    },
  },
  rating_avg: {
    type: DataTypes.DECIMAL(2, 1),
    defaultValue: 0,
  },
  rating_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  // Razorpay Route fields
  razorpay_account_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  kyc_status: {
    type: DataTypes.ENUM('not_started', 'pending', 'verified', 'failed'),
    defaultValue: 'not_started',
  },
  payout_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  commission_override: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
  },
}, {
  tableName: 'salons',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['owner_id'] },
    { fields: ['is_active', 'gender_type'] },
    { fields: ['city'] },
  ],
});

export default Salon;
