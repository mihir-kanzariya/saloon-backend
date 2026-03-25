import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const StylistService: any = sequelize.define('StylistService', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  salon_member_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'salon_members',
      key: 'id',
    },
  },
  service_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'services',
      key: 'id',
    },
  },
  custom_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  custom_duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'stylist_services',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['salon_member_id', 'service_id'],
    },
  ],
});

export default StylistService;
