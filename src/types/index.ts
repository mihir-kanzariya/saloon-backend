import { Request } from 'express';
import { Model } from 'sequelize';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: UserAttributes;
  salonMember?: SalonMemberAttributes;
}

// User
export interface UserAttributes {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  gender: 'male' | 'female' | 'other' | null;
  profile_photo: string | null;
  role: 'customer' | 'salon_user' | 'admin';
  otp: string | null;
  otp_expires_at: Date | null;
  fcm_token: string | null;
  is_active: boolean;
  is_profile_complete: boolean;
  last_login_at: Date | null;
  saved_addresses: SavedAddress[];
  created_at?: Date;
  updated_at?: Date;
}

export interface SavedAddress {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

// Salon
export interface SalonAttributes {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  phone: string;
  email: string | null;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number;
  longitude: number;
  gender_type: 'men' | 'women' | 'unisex';
  cover_image: string | null;
  gallery: string[];
  amenities: string[];
  operating_hours: OperatingHours;
  holidays: string[];
  booking_settings: BookingSettings;
  rating_avg: number;
  rating_count: number;
  is_active: boolean;
  is_verified: boolean;
  razorpay_account_id: string | null;
  kyc_status: KycStatus;
  payout_enabled: boolean;
  commission_override: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface OperatingHours {
  [day: string]: {
    open: string;
    close: string;
    is_open: boolean;
  };
}

export interface BookingSettings {
  advance_booking_days: number;
  slot_duration_minutes: number;
  buffer_between_bookings_minutes: number;
  auto_accept_bookings: boolean;
  cancellation_policy_hours: number;
  allow_reschedule: boolean;
  reschedule_policy_hours: number;
  require_prepayment: boolean;
  token_amount: number;
}

// Salon Member
export interface SalonMemberAttributes {
  id: string;
  salon_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'receptionist' | 'stylist';
  invited_by: string | null;
  invitation_status: 'pending' | 'accepted' | 'rejected';
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

// Service
export interface ServiceAttributes {
  id: string;
  salon_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  discounted_price: number | null;
  duration_minutes: number;
  gender: 'men' | 'women' | 'unisex';
  image: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

// Razorpay Route types
export type KycStatus = 'not_started' | 'pending' | 'verified' | 'failed';
export type LinkedAccountStatus = 'created' | 'needs_clarification' | 'under_review' | 'activated' | 'suspended' | 'rejected';
export type SettlementStatus = 'not_applicable' | 'pending_settlement' | 'settled' | 'refund_adjusted';
export type TransferStatus = 'created' | 'pending' | 'processed' | 'settled' | 'failed' | 'reversed';
export type EarningStatus = 'pending' | 'ready_for_settlement' | 'settled' | 'refund_adjusted' | 'withdrawn';
export type RefundStatus = 'none' | 'partial' | 'full';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  fee: number;
  tax: number;
  order_id: string;
}

export interface RazorpayTransfer {
  id: string;
  amount: number;
  currency: string;
  status: string;
  source: string;
  recipient: string;
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  speed_processed: string;
}

export interface RazorpayLinkedAccount {
  id: string;
  type: string;
  status: string;
  email: string;
  phone: string;
  legal_business_name: string;
  customer_facing_business_name?: string;
  business_type: string;
  created_at: number;
}

export interface SalonSettlementData {
  salonId: string;
  linkedAccountId: string;
  razorpayAccountId: string;
  earnings: Array<{ id: string; bookingId: string; netAmount: number }>;
  refundAdjustments: number;
  totalNetAmount: number;
  finalTransferAmount: number;
}

// Booking
export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type PaymentMode = 'online' | 'pay_at_salon' | 'token';
export type PaymentStatus = 'pending' | 'token_paid' | 'paid' | 'refunded' | 'partially_refunded';

export interface BookingAttributes {
  id: string;
  booking_number: string;
  customer_id: string;
  salon_id: string;
  stylist_member_id: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_duration_minutes: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_mode: PaymentMode;
  payment_status: PaymentStatus;
  token_amount: number;
  status: BookingStatus;
  cancelled_by: 'customer' | 'salon' | null;
  cancellation_reason: string | null;
  is_auto_assigned: boolean;
  customer_notes: string | null;
  salon_notes: string | null;
  settlement_status: SettlementStatus;
  settlement_batch_id: string | null;
  settled_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

// API Response
export interface ApiResponseData<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ValidationError[];
  meta?: PaginationMeta;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}
