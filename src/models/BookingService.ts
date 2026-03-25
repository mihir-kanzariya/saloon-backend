import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const BookingService: any = sequelize.define('BookingService', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'bookings',
      key: 'id',
    },
  },
  service_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'services',
      key: 'id',
    },
  },
  service_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'booking_services',
  timestamps: true,
  underscored: true,
});

export default BookingService;
