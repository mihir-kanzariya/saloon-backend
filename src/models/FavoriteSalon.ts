import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const FavoriteSalon: any = sequelize.define('FavoriteSalon', {
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
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
}, {
  tableName: 'favorite_salons',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'salon_id'],
    },
  ],
});

export default FavoriteSalon;
