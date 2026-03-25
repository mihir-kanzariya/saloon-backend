import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const WebhookEvent: any = sequelize.define('WebhookEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  event_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  event_type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  entity_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  payload: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('received', 'processing', 'processed', 'failed', 'ignored'),
    defaultValue: 'received',
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'webhook_events',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['event_id'], unique: true },
    { fields: ['event_type', 'status'] },
    { fields: ['entity_id'] },
    { fields: ['status', 'updated_at'] },
  ],
});

export default WebhookEvent;
