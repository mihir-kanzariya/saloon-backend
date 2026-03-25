import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const User: any = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other'),
    allowNull: true,
  },
  profile_photo: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('customer', 'salon_user', 'admin'),
    defaultValue: 'customer',
  },
  otp: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  otp_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  fcm_token: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_profile_complete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  saved_addresses: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
});

export default User;
