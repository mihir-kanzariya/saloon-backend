import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const ChatRoom: any = sequelize.define('ChatRoom', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'bookings',
      key: 'id',
    },
  },
  customer_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  closed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'chat_rooms',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['customer_id', 'is_active'] },
    { fields: ['salon_id', 'is_active'] },
  ],
});

export default ChatRoom;
