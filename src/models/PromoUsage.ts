import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const PromoUsage: any = sequelize.define('PromoUsage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  promo_code_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'promo_codes',
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
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
}, {
  tableName: 'promo_usages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'promo_code_id'], unique: true },
  ],
});

export default PromoUsage;
