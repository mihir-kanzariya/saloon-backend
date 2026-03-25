import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const ServiceCategory: any = sequelize.define('ServiceCategory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  icon: {
    type: DataTypes.STRING(255),
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
  tableName: 'service_categories',
  timestamps: true,
  underscored: true,
});

export default ServiceCategory;
