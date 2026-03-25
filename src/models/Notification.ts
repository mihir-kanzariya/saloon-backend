import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Notification: any = sequelize.define('Notification', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM(
      'booking_created',
      'booking_confirmed',
      'booking_cancelled',
      'booking_reminder',
      'booking_in_progress',
      'booking_completed',
      'review_reminder',
      'review_request',
      'chat_message',
      'payment_received',
      'payment_reminder',
      'withdrawal_processed',
      'invitation',
      'booking_no_show',
      'general'
    ),
    allowNull: false,
  },
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'is_read', 'created_at'] },
  ],
});

export default Notification;
