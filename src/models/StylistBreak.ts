import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const StylistBreak: any = sequelize.define('StylistBreak', {
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
  break_type: {
    type: DataTypes.ENUM('recurring', 'one_time'),
    allowNull: false,
  },
  day_of_week: {
    type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    allowNull: true,
  },
  specific_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  start_time: {
    type: DataTypes.STRING(5),
    allowNull: false,
  },
  end_time: {
    type: DataTypes.STRING(5),
    allowNull: false,
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
}, {
  tableName: 'stylist_breaks',
  timestamps: true,
  underscored: true,
});

export default StylistBreak;
