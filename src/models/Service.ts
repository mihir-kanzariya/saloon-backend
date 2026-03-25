import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Service: any = sequelize.define('Service', {
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
  category_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'service_categories',
      key: 'id',
    },
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  discounted_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 5,
    },
  },
  gender: {
    type: DataTypes.ENUM('men', 'women', 'unisex'),
    defaultValue: 'unisex',
  },
  image: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'services',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id', 'is_active'] },
    // C.4: Composite index for getNearby min/max price subqueries
    { fields: ['salon_id', 'is_active', 'price'] },
  ],
});

export default Service;
