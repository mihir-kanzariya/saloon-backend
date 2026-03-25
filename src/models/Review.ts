import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Review: any = sequelize.define('Review', {
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
  stylist_member_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'salon_members',
      key: 'id',
    },
  },
  salon_rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5,
    },
  },
  stylist_rating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 5,
    },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  photos: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  reply: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  replied_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_visible: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'reviews',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id'] },
    // C.4: Add index on customer_id
    { fields: ['customer_id'] },
  ],
});

export default Review;
