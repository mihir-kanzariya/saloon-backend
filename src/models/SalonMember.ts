import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const SalonMember: any = sequelize.define('SalonMember', {
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
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  role: {
    type: DataTypes.ENUM('owner', 'manager', 'receptionist', 'stylist'),
    allowNull: false,
  },
  invited_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  invitation_status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    // E.2: Default to 'pending' instead of 'accepted'
    defaultValue: 'pending',
  },
  commission_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0,
  },
  specializations: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'salon_members',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['salon_id', 'user_id'],
    },
  ],
});

export default SalonMember;
