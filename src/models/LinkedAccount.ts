import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

const LinkedAccount: any = sequelize.define('LinkedAccount', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  salon_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'salons',
      key: 'id',
    },
  },
  razorpay_account_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  razorpay_product_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('created', 'needs_clarification', 'under_review', 'activated', 'suspended', 'rejected'),
    defaultValue: 'created',
  },
  legal_business_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  business_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  contact_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  contact_email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  contact_phone: {
    type: DataTypes.STRING(15),
    allowNull: false,
  },
  pan: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  gst: {
    type: DataTypes.STRING(15),
    allowNull: true,
  },
  bank_account_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  bank_ifsc: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
  bank_beneficiary_name: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  kyc_status: {
    type: DataTypes.ENUM('not_started', 'pending', 'verified', 'failed'),
    defaultValue: 'pending',
  },
  activated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  razorpay_raw_response: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'linked_accounts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['salon_id'], unique: true },
    { fields: ['razorpay_account_id'], unique: true },
    { fields: ['status'] },
  ],
});

export default LinkedAccount;
