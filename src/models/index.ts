import User from './User';
import Salon from './Salon';
import SalonMember from './SalonMember';
import ServiceCategory from './ServiceCategory';
import Service from './Service';
import StylistService from './StylistService';
import StylistAvailability from './StylistAvailability';
import StylistBreak from './StylistBreak';
import StylistLeave from './StylistLeave';
import Booking from './Booking';
import BookingService from './BookingService';
import Payment from './Payment';
import SalonEarning from './SalonEarning';
import Withdrawal from './Withdrawal';
import Review from './Review';
import ChatRoom from './ChatRoom';
import ChatMessage from './ChatMessage';
import Notification from './Notification';
import FavoriteSalon from './FavoriteSalon';
import LinkedAccount from './LinkedAccount';
import Transfer from './Transfer';
import SettlementBatch from './SettlementBatch';
import WebhookEvent from './WebhookEvent';
import PayoutRequest from './PayoutRequest';
import Wallet from './Wallet';
import WalletLedger from './WalletLedger';
import PromoCode from './PromoCode';
import PromoUsage from './PromoUsage';

// =====================
// User <-> Salon
// =====================
User.hasMany(Salon, { foreignKey: 'owner_id', as: 'owned_salons' });
Salon.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

// =====================
// Salon <-> SalonMember (E.1: CASCADE)
// =====================
Salon.hasMany(SalonMember, { foreignKey: 'salon_id', as: 'members', onDelete: 'CASCADE' });
SalonMember.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// User <-> SalonMember
// =====================
User.hasMany(SalonMember, { foreignKey: 'user_id', as: 'salon_memberships' });
SalonMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SalonMember.belongsTo(User, { foreignKey: 'invited_by', as: 'inviter' });

// =====================
// Salon <-> Service (E.1: CASCADE)
// =====================
Salon.hasMany(Service, { foreignKey: 'salon_id', as: 'services', onDelete: 'CASCADE' });
Service.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// ServiceCategory <-> Service
// =====================
ServiceCategory.hasMany(Service, { foreignKey: 'category_id', as: 'services' });
Service.belongsTo(ServiceCategory, { foreignKey: 'category_id', as: 'category' });

// =====================
// SalonMember <-> StylistService
// =====================
SalonMember.hasMany(StylistService, { foreignKey: 'salon_member_id', as: 'stylist_services' });
StylistService.belongsTo(SalonMember, { foreignKey: 'salon_member_id', as: 'salon_member' });

// =====================
// Service <-> StylistService
// =====================
Service.hasMany(StylistService, { foreignKey: 'service_id', as: 'stylist_services' });
StylistService.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });

// =====================
// SalonMember <-> StylistAvailability
// =====================
SalonMember.hasMany(StylistAvailability, { foreignKey: 'salon_member_id', as: 'availability' });
StylistAvailability.belongsTo(SalonMember, { foreignKey: 'salon_member_id', as: 'salon_member' });

// =====================
// SalonMember <-> StylistBreak
// =====================
SalonMember.hasMany(StylistBreak, { foreignKey: 'salon_member_id', as: 'breaks' });
StylistBreak.belongsTo(SalonMember, { foreignKey: 'salon_member_id', as: 'salon_member' });

// =====================
// SalonMember <-> StylistLeave
// =====================
SalonMember.hasMany(StylistLeave, { foreignKey: 'salon_member_id', as: 'leaves' });
StylistLeave.belongsTo(SalonMember, { foreignKey: 'salon_member_id', as: 'salon_member' });

// =====================
// User <-> Booking
// =====================
User.hasMany(Booking, { foreignKey: 'customer_id', as: 'bookings' });
Booking.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });

// =====================
// Salon <-> Booking
// =====================
Salon.hasMany(Booking, { foreignKey: 'salon_id', as: 'bookings' });
Booking.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// SalonMember <-> Booking
// =====================
SalonMember.hasMany(Booking, { foreignKey: 'stylist_member_id', as: 'bookings' });
Booking.belongsTo(SalonMember, { foreignKey: 'stylist_member_id', as: 'stylist' });

// =====================
// Booking <-> BookingService (E.1: CASCADE)
// =====================
Booking.hasMany(BookingService, { foreignKey: 'booking_id', as: 'services', onDelete: 'CASCADE' });
BookingService.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// Service <-> BookingService
// =====================
Service.hasMany(BookingService, { foreignKey: 'service_id', as: 'booking_services' });
BookingService.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });

// =====================
// Booking <-> Payment (E.1: CASCADE)
// =====================
Booking.hasMany(Payment, { foreignKey: 'booking_id', as: 'payments', onDelete: 'CASCADE' });
Payment.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// User <-> Payment
// =====================
User.hasMany(Payment, { foreignKey: 'user_id', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// =====================
// Salon <-> Payment
// =====================
Salon.hasMany(Payment, { foreignKey: 'salon_id', as: 'payments' });
Payment.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// Salon <-> SalonEarning
// =====================
Salon.hasMany(SalonEarning, { foreignKey: 'salon_id', as: 'earnings' });
SalonEarning.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// Booking <-> SalonEarning (E.1: CASCADE)
// =====================
Booking.hasOne(SalonEarning, { foreignKey: 'booking_id', as: 'earning', onDelete: 'CASCADE' });
SalonEarning.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// Salon <-> Withdrawal
// =====================
Salon.hasMany(Withdrawal, { foreignKey: 'salon_id', as: 'withdrawals' });
Withdrawal.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// User <-> Withdrawal
// =====================
User.hasMany(Withdrawal, { foreignKey: 'requested_by', as: 'withdrawals' });
Withdrawal.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });

// =====================
// Booking <-> Review (E.1: CASCADE)
// =====================
Booking.hasOne(Review, { foreignKey: 'booking_id', as: 'review', onDelete: 'CASCADE' });
Review.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// User <-> Review
// =====================
User.hasMany(Review, { foreignKey: 'customer_id', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });

// =====================
// Salon <-> Review
// =====================
Salon.hasMany(Review, { foreignKey: 'salon_id', as: 'reviews' });
Review.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// SalonMember <-> Review
// =====================
SalonMember.hasMany(Review, { foreignKey: 'stylist_member_id', as: 'reviews' });
Review.belongsTo(SalonMember, { foreignKey: 'stylist_member_id', as: 'stylist' });

// =====================
// Booking <-> ChatRoom (E.1: CASCADE)
// =====================
Booking.hasOne(ChatRoom, { foreignKey: 'booking_id', as: 'chat_room', onDelete: 'CASCADE' });
ChatRoom.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// User <-> ChatRoom
// =====================
User.hasMany(ChatRoom, { foreignKey: 'customer_id', as: 'customer_chat_rooms' });
ChatRoom.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });

// =====================
// Salon <-> ChatRoom
// =====================
Salon.hasMany(ChatRoom, { foreignKey: 'salon_id', as: 'chat_rooms' });
ChatRoom.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// ChatRoom <-> ChatMessage (E.1: CASCADE)
// =====================
ChatRoom.hasMany(ChatMessage, { foreignKey: 'chat_room_id', as: 'messages', onDelete: 'CASCADE' });
ChatMessage.belongsTo(ChatRoom, { foreignKey: 'chat_room_id', as: 'chat_room' });

// =====================
// User <-> ChatMessage
// =====================
User.hasMany(ChatMessage, { foreignKey: 'sender_id', as: 'sent_messages' });
ChatMessage.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

// =====================
// User <-> Notification (E.1: CASCADE)
// =====================
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// =====================
// User <-> FavoriteSalon
// =====================
User.hasMany(FavoriteSalon, { foreignKey: 'user_id', as: 'favorites', onDelete: 'CASCADE' });
FavoriteSalon.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// =====================
// Salon <-> FavoriteSalon
// =====================
Salon.hasMany(FavoriteSalon, { foreignKey: 'salon_id', as: 'favorited_by' });
FavoriteSalon.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// Salon <-> LinkedAccount (1:1)
// =====================
Salon.hasOne(LinkedAccount, { foreignKey: 'salon_id', as: 'linked_account' });
LinkedAccount.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// SettlementBatch <-> Transfer
// =====================
SettlementBatch.hasMany(Transfer, { foreignKey: 'settlement_batch_id', as: 'transfers' });
Transfer.belongsTo(SettlementBatch, { foreignKey: 'settlement_batch_id', as: 'settlement_batch' });

// =====================
// Salon <-> Transfer
// =====================
Salon.hasMany(Transfer, { foreignKey: 'salon_id', as: 'transfers' });
Transfer.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// LinkedAccount <-> Transfer
// =====================
LinkedAccount.hasMany(Transfer, { foreignKey: 'linked_account_id', as: 'transfers' });
Transfer.belongsTo(LinkedAccount, { foreignKey: 'linked_account_id', as: 'linked_account' });

// =====================
// SettlementBatch <-> SalonEarning
// =====================
SettlementBatch.hasMany(SalonEarning, { foreignKey: 'settlement_batch_id', as: 'earnings' });
SalonEarning.belongsTo(SettlementBatch, { foreignKey: 'settlement_batch_id', as: 'settlement_batch' });

// =====================
// Transfer <-> SalonEarning
// =====================
Transfer.hasMany(SalonEarning, { foreignKey: 'transfer_id', as: 'earnings' });
SalonEarning.belongsTo(Transfer, { foreignKey: 'transfer_id', as: 'transfer' });

// =====================
// Booking <-> SettlementBatch
// =====================
SettlementBatch.hasMany(Booking, { foreignKey: 'settlement_batch_id', as: 'bookings' });
Booking.belongsTo(SettlementBatch, { foreignKey: 'settlement_batch_id', as: 'settlement_batch' });

// =====================
// Salon <-> PayoutRequest
// =====================
Salon.hasMany(PayoutRequest, { foreignKey: 'salon_id', as: 'payout_requests' });
PayoutRequest.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// User <-> PayoutRequest (initiated_by)
// =====================
User.hasMany(PayoutRequest, { foreignKey: 'initiated_by', as: 'initiated_payouts' });
PayoutRequest.belongsTo(User, { foreignKey: 'initiated_by', as: 'initiator' });

// =====================
// Salon <-> PromoCode
// =====================
Salon.hasMany(PromoCode, { foreignKey: 'salon_id', as: 'promo_codes' });
PromoCode.belongsTo(Salon, { foreignKey: 'salon_id', as: 'salon' });

// =====================
// User <-> PromoUsage
// =====================
User.hasMany(PromoUsage, { foreignKey: 'user_id', as: 'promo_usages' });
PromoUsage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// =====================
// PromoCode <-> PromoUsage
// =====================
PromoCode.hasMany(PromoUsage, { foreignKey: 'promo_code_id', as: 'usages' });
PromoUsage.belongsTo(PromoCode, { foreignKey: 'promo_code_id', as: 'promo_code' });

// =====================
// Booking <-> PromoUsage
// =====================
Booking.hasOne(PromoUsage, { foreignKey: 'booking_id', as: 'promo_usage' });
PromoUsage.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// =====================
// Wallet <-> WalletLedger (Salon↔Wallet skipped to avoid Node22+Sequelize6 Object.assign bug)
// Wallet uses salon_id FK directly via WalletService.getOrCreateWallet()
// =====================
Wallet.hasMany(WalletLedger, { foreignKey: 'wallet_id', as: 'ledger_entries' });
WalletLedger.belongsTo(Wallet, { foreignKey: 'wallet_id', as: 'wallet' });
export {
  User,
  Salon,
  SalonMember,
  ServiceCategory,
  Service,
  StylistService,
  StylistAvailability,
  StylistBreak,
  StylistLeave,
  Booking,
  BookingService,
  Payment,
  SalonEarning,
  Withdrawal,
  Review,
  ChatRoom,
  ChatMessage,
  Notification,
  FavoriteSalon,
  LinkedAccount,
  Transfer,
  SettlementBatch,
  WebhookEvent,
  PayoutRequest,
  Wallet,
  WalletLedger,
  PromoCode,
  PromoUsage,
};
