import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const StylistAvailability: any = sequelize.define('StylistAvailability', {
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
  day_of_week: {
    type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
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
  is_available: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'stylist_availability',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['salon_member_id', 'day_of_week'],
    },
  ],
});

export default StylistAvailability;
