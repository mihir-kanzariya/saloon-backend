import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const Withdrawal: any = sequelize.define('Withdrawal', {
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
  requested_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  bank_details: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending',
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  transaction_reference: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  remarks: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'withdrawals',
  timestamps: true,
  underscored: true,
  // C.4/E.4: Add index on salon_id + status
  indexes: [
    { fields: ['salon_id', 'status'] },
  ],
});

export default Withdrawal;
