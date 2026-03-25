import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const ChatMessage: any = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  chat_room_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'chat_rooms',
      key: 'id',
    },
  },
  sender_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  message_type: {
    type: DataTypes.ENUM('text', 'image'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'chat_messages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['chat_room_id', 'created_at'] },
    { fields: ['chat_room_id', 'sender_id', 'is_read'] },
  ],
});

export default ChatMessage;
