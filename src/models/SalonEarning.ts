import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const SalonEarning: any = sequelize.define('SalonEarning', {
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
  booking_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'bookings',
      key: 'id',
    },
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  commission_percent: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: false,
  },
  commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  net_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'ready_for_settlement', 'settled', 'refund_adjusted', 'withdrawn'),
    defaultValue: 'pending',
  },
  // Settlement tracking fields
  settlement_batch_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'settlement_batches',
      key: 'id',
    },
  },
  transfer_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transfers',
      key: 'id',
    },
  },
  refund_adjustment: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
}, {
  tableName: 'salon_earnings',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id', 'status'] },
    { fields: ['booking_id'], unique: true },
    { fields: ['status', 'salon_id'] },
  ],
});

export default SalonEarning;
