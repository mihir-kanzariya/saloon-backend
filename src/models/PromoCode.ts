import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const PromoCode: any = sequelize.define('PromoCode', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  code: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  discount_type: {
    type: DataTypes.ENUM('percent', 'flat'),
    allowNull: false,
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  min_order: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  max_discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  valid_from: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  valid_until: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  max_uses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  current_uses: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'promo_codes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['salon_id'] },
    { fields: ['is_active', 'valid_from', 'valid_until'] },
  ],
});

export default PromoCode;
