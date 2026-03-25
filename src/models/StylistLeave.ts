import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const StylistLeave: any = sequelize.define('StylistLeave', {
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
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'stylist_leaves',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['salon_member_id', 'date'],
    },
  ],
});

export default StylistLeave;
