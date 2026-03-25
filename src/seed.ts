import { sequelize } from './config/database';
import {
  User,
  Salon,
  SalonMember,
  ServiceCategory,
  Service,
  StylistService,
  StylistAvailability,
  Booking,
  BookingService,
  Review,
  Notification,
} from './models';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Pre-generate all UUIDs so foreign keys reference correctly
// =============================================================================

// Users
const USER_1_ID = uuidv4(); // Arjun Mehta (owner)
const USER_2_ID = uuidv4(); // Priya Sharma (owner)
const USER_3_ID = uuidv4(); // Rahul Verma (customer)
const USER_4_ID = uuidv4(); // Sneha Patel (customer)
const USER_5_ID = uuidv4(); // Vikram Singh (stylist)
const USER_6_ID = uuidv4(); // Anita Desai (stylist)

// Salons
const SALON_1_ID = uuidv4(); // Urban Edge Salon
const SALON_2_ID = uuidv4(); // Glamour Studio

// Service Categories
const CAT_HAIR_ID = uuidv4();
const CAT_SKIN_ID = uuidv4();
const CAT_NAILS_ID = uuidv4();
const CAT_BEARD_ID = uuidv4();
const CAT_SPA_ID = uuidv4();

// Salon Members
const MEMBER_1_ID = uuidv4(); // User 1 as owner of Salon 1
const MEMBER_2_ID = uuidv4(); // User 2 as owner of Salon 2
const MEMBER_3_ID = uuidv4(); // User 5 as stylist of Salon 1
const MEMBER_4_ID = uuidv4(); // User 6 as stylist of Salon 2

// Services - Salon 1
const SVC_S1_HAIRCUT_ID = uuidv4();
const SVC_S1_BEARD_TRIM_ID = uuidv4();
const SVC_S1_HAIR_COLOR_ID = uuidv4();
const SVC_S1_FACIAL_ID = uuidv4();
const SVC_S1_HEAD_MASSAGE_ID = uuidv4();

// Services - Salon 2
const SVC_S2_WOMENS_HAIRCUT_ID = uuidv4();
const SVC_S2_HAIR_SPA_ID = uuidv4();
const SVC_S2_BRIDAL_MAKEUP_ID = uuidv4();
const SVC_S2_MANICURE_ID = uuidv4();
const SVC_S2_BODY_MASSAGE_ID = uuidv4();

// Bookings
const BOOKING_1_ID = uuidv4();
const BOOKING_2_ID = uuidv4();
const BOOKING_3_ID = uuidv4();

// =============================================================================
// Date helpers
// =============================================================================
const today = new Date();

const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const dayAfterTomorrow = new Date(today);
dayAfterTomorrow.setDate(today.getDate() + 2);

const formatDate = (d: Date): string => {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

// =============================================================================
// Seed function
// =============================================================================
const seed = async () => {
  try {
    console.log('Starting seed...');
    await sequelize.sync({ force: true });
    console.log('Database synced (all tables dropped and recreated)');

    // =========================================================================
    // 1. Service Categories
    // =========================================================================
    console.log('Seeding service categories...');
    await ServiceCategory.bulkCreate([
      { id: CAT_HAIR_ID, name: 'Hair', icon: 'scissors', display_order: 1, is_active: true },
      { id: CAT_SKIN_ID, name: 'Skin', icon: 'sparkles', display_order: 2, is_active: true },
      { id: CAT_NAILS_ID, name: 'Nails', icon: 'hand', display_order: 3, is_active: true },
      { id: CAT_BEARD_ID, name: 'Beard & Shave', icon: 'razor', display_order: 4, is_active: true },
      { id: CAT_SPA_ID, name: 'Spa & Massage', icon: 'spa', display_order: 5, is_active: true },
    ]);
    console.log('Service categories seeded (5 records)');

    // =========================================================================
    // 2. Users
    // =========================================================================
    console.log('Seeding users...');
    await User.bulkCreate([
      {
        id: USER_1_ID,
        phone: '9999999001',
        name: 'Arjun Mehta',
        email: 'arjun.mehta@example.com',
        gender: 'male',
        role: 'salon_user',
        is_active: true,
        is_profile_complete: true,
      },
      {
        id: USER_2_ID,
        phone: '9999999002',
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        gender: 'female',
        role: 'salon_user',
        is_active: true,
        is_profile_complete: true,
      },
      {
        id: USER_3_ID,
        phone: '9999999003',
        name: 'Rahul Verma',
        email: 'rahul.verma@example.com',
        gender: 'male',
        role: 'customer',
        is_active: true,
        is_profile_complete: true,
      },
      {
        id: USER_4_ID,
        phone: '9999999004',
        name: 'Sneha Patel',
        email: 'sneha.patel@example.com',
        gender: 'female',
        role: 'customer',
        is_active: true,
        is_profile_complete: true,
      },
      {
        id: USER_5_ID,
        phone: '9999999005',
        name: 'Vikram Singh',
        email: 'vikram.singh@example.com',
        gender: 'male',
        role: 'salon_user',
        is_active: true,
        is_profile_complete: true,
      },
      {
        id: USER_6_ID,
        phone: '9999999006',
        name: 'Anita Desai',
        email: 'anita.desai@example.com',
        gender: 'female',
        role: 'salon_user',
        is_active: true,
        is_profile_complete: true,
      },
    ]);
    console.log('Users seeded (6 records)');

    // =========================================================================
    // 3. Salons
    // =========================================================================
    console.log('Seeding salons...');
    await Salon.bulkCreate([
      {
        id: SALON_1_ID,
        owner_id: USER_1_ID,
        name: 'Urban Edge Salon',
        description: 'A modern unisex salon offering premium grooming services in the heart of Ahmedabad.',
        phone: '9999999001',
        email: 'info@urbanedgesalon.com',
        address: '123 MG Road, Ahmedabad',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380001',
        latitude: 23.0225,
        longitude: 72.5714,
        gender_type: 'unisex',
        amenities: ['wifi', 'ac', 'parking', 'beverages'],
        operating_hours: {
          monday: { open: '09:00', close: '20:00', is_open: true },
          tuesday: { open: '09:00', close: '20:00', is_open: true },
          wednesday: { open: '09:00', close: '20:00', is_open: true },
          thursday: { open: '09:00', close: '20:00', is_open: true },
          friday: { open: '09:00', close: '20:00', is_open: true },
          saturday: { open: '09:00', close: '20:00', is_open: true },
          sunday: { open: '09:00', close: '20:00', is_open: false },
        },
        rating_avg: 4.5,
        rating_count: 12,
        is_active: true,
        is_verified: true,
      },
      {
        id: SALON_2_ID,
        owner_id: USER_2_ID,
        name: 'Glamour Studio',
        description: 'An exclusive women-only salon specializing in bridal and beauty services.',
        phone: '9999999002',
        email: 'info@glamourstudio.com',
        address: '456 CG Road, Ahmedabad',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380006',
        latitude: 23.0300,
        longitude: 72.5600,
        gender_type: 'women',
        amenities: ['wifi', 'ac', 'tv'],
        operating_hours: {
          monday: { open: '10:00', close: '19:00', is_open: true },
          tuesday: { open: '10:00', close: '19:00', is_open: true },
          wednesday: { open: '10:00', close: '19:00', is_open: true },
          thursday: { open: '10:00', close: '19:00', is_open: true },
          friday: { open: '10:00', close: '19:00', is_open: true },
          saturday: { open: '10:00', close: '19:00', is_open: true },
          sunday: { open: '10:00', close: '19:00', is_open: false },
        },
        rating_avg: 4.2,
        rating_count: 8,
        is_active: true,
        is_verified: true,
      },
    ]);
    console.log('Salons seeded (2 records)');

    // =========================================================================
    // 4. Salon Members
    // =========================================================================
    console.log('Seeding salon members...');
    await SalonMember.bulkCreate([
      {
        id: MEMBER_1_ID,
        salon_id: SALON_1_ID,
        user_id: USER_1_ID,
        role: 'owner',
        invitation_status: 'accepted',
        is_active: true,
      },
      {
        id: MEMBER_2_ID,
        salon_id: SALON_2_ID,
        user_id: USER_2_ID,
        role: 'owner',
        invitation_status: 'accepted',
        is_active: true,
      },
      {
        id: MEMBER_3_ID,
        salon_id: SALON_1_ID,
        user_id: USER_5_ID,
        role: 'stylist',
        invited_by: USER_1_ID,
        invitation_status: 'accepted',
        is_active: true,
      },
      {
        id: MEMBER_4_ID,
        salon_id: SALON_2_ID,
        user_id: USER_6_ID,
        role: 'stylist',
        invited_by: USER_2_ID,
        invitation_status: 'accepted',
        is_active: true,
      },
    ]);
    console.log('Salon members seeded (4 records)');

    // =========================================================================
    // 5. Services
    // =========================================================================
    console.log('Seeding services...');
    await Service.bulkCreate([
      // Salon 1 services
      {
        id: SVC_S1_HAIRCUT_ID,
        salon_id: SALON_1_ID,
        category_id: CAT_HAIR_ID,
        name: 'Haircut',
        description: 'Professional men\'s haircut with styling.',
        price: 300.00,
        duration_minutes: 30,
        gender: 'men',
        display_order: 1,
        is_active: true,
      },
      {
        id: SVC_S1_BEARD_TRIM_ID,
        salon_id: SALON_1_ID,
        category_id: CAT_BEARD_ID,
        name: 'Beard Trim',
        description: 'Clean beard trim and shaping.',
        price: 150.00,
        duration_minutes: 20,
        gender: 'men',
        display_order: 2,
        is_active: true,
      },
      {
        id: SVC_S1_HAIR_COLOR_ID,
        salon_id: SALON_1_ID,
        category_id: CAT_HAIR_ID,
        name: 'Hair Color',
        description: 'Full hair coloring with premium products.',
        price: 1500.00,
        duration_minutes: 90,
        gender: 'unisex',
        display_order: 3,
        is_active: true,
      },
      {
        id: SVC_S1_FACIAL_ID,
        salon_id: SALON_1_ID,
        category_id: CAT_SKIN_ID,
        name: 'Facial',
        description: 'Deep cleansing facial treatment.',
        price: 800.00,
        duration_minutes: 45,
        gender: 'unisex',
        display_order: 4,
        is_active: true,
      },
      {
        id: SVC_S1_HEAD_MASSAGE_ID,
        salon_id: SALON_1_ID,
        category_id: CAT_SPA_ID,
        name: 'Head Massage',
        description: 'Relaxing head and scalp massage with oil.',
        price: 500.00,
        duration_minutes: 30,
        gender: 'unisex',
        display_order: 5,
        is_active: true,
      },
      // Salon 2 services
      {
        id: SVC_S2_WOMENS_HAIRCUT_ID,
        salon_id: SALON_2_ID,
        category_id: CAT_HAIR_ID,
        name: "Women's Haircut",
        description: 'Stylish haircut and blow-dry for women.',
        price: 500.00,
        duration_minutes: 45,
        gender: 'women',
        display_order: 1,
        is_active: true,
      },
      {
        id: SVC_S2_HAIR_SPA_ID,
        salon_id: SALON_2_ID,
        category_id: CAT_HAIR_ID,
        name: 'Hair Spa',
        description: 'Deep conditioning hair spa with keratin treatment.',
        price: 1200.00,
        duration_minutes: 60,
        gender: 'women',
        display_order: 2,
        is_active: true,
      },
      {
        id: SVC_S2_BRIDAL_MAKEUP_ID,
        salon_id: SALON_2_ID,
        category_id: CAT_SKIN_ID,
        name: 'Bridal Makeup',
        description: 'Complete bridal makeup with HD finish.',
        price: 5000.00,
        duration_minutes: 120,
        gender: 'women',
        display_order: 3,
        is_active: true,
      },
      {
        id: SVC_S2_MANICURE_ID,
        salon_id: SALON_2_ID,
        category_id: CAT_NAILS_ID,
        name: 'Manicure',
        description: 'Classic manicure with nail art.',
        price: 600.00,
        duration_minutes: 40,
        gender: 'women',
        display_order: 4,
        is_active: true,
      },
      {
        id: SVC_S2_BODY_MASSAGE_ID,
        salon_id: SALON_2_ID,
        category_id: CAT_SPA_ID,
        name: 'Body Massage',
        description: 'Full body relaxation massage with aromatherapy.',
        price: 2000.00,
        duration_minutes: 60,
        gender: 'women',
        display_order: 5,
        is_active: true,
      },
    ]);
    console.log('Services seeded (10 records)');

    // =========================================================================
    // 6. Stylist Availability
    // =========================================================================
    console.log('Seeding stylist availability...');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

    const stylist5Availability = days.map((day) => ({
      id: uuidv4(),
      salon_member_id: MEMBER_3_ID,
      day_of_week: day,
      start_time: day === 'sunday' ? '00:00' : '09:00',
      end_time: day === 'sunday' ? '00:00' : '18:00',
      is_available: day !== 'sunday',
    }));

    const stylist6Availability = days.map((day) => ({
      id: uuidv4(),
      salon_member_id: MEMBER_4_ID,
      day_of_week: day,
      start_time: day === 'sunday' ? '00:00' : '10:00',
      end_time: day === 'sunday' ? '00:00' : '19:00',
      is_available: day !== 'sunday',
    }));

    await StylistAvailability.bulkCreate([...stylist5Availability, ...stylist6Availability]);
    console.log('Stylist availability seeded (14 records)');

    // =========================================================================
    // 7. Stylist Services (link stylists to their salon services)
    // =========================================================================
    console.log('Seeding stylist services...');
    await StylistService.bulkCreate([
      // User 5 (Stylist at Salon 1) - specializes in hair and beard
      { id: uuidv4(), salon_member_id: MEMBER_3_ID, service_id: SVC_S1_HAIRCUT_ID },
      { id: uuidv4(), salon_member_id: MEMBER_3_ID, service_id: SVC_S1_BEARD_TRIM_ID },
      { id: uuidv4(), salon_member_id: MEMBER_3_ID, service_id: SVC_S1_HAIR_COLOR_ID },
      { id: uuidv4(), salon_member_id: MEMBER_3_ID, service_id: SVC_S1_FACIAL_ID },
      { id: uuidv4(), salon_member_id: MEMBER_3_ID, service_id: SVC_S1_HEAD_MASSAGE_ID },
      // User 6 (Stylist at Salon 2) - specializes in hair, skin, and nails
      { id: uuidv4(), salon_member_id: MEMBER_4_ID, service_id: SVC_S2_WOMENS_HAIRCUT_ID },
      { id: uuidv4(), salon_member_id: MEMBER_4_ID, service_id: SVC_S2_HAIR_SPA_ID },
      { id: uuidv4(), salon_member_id: MEMBER_4_ID, service_id: SVC_S2_BRIDAL_MAKEUP_ID },
      { id: uuidv4(), salon_member_id: MEMBER_4_ID, service_id: SVC_S2_MANICURE_ID },
      { id: uuidv4(), salon_member_id: MEMBER_4_ID, service_id: SVC_S2_BODY_MASSAGE_ID },
    ]);
    console.log('Stylist services seeded (10 records)');

    // =========================================================================
    // 8. Bookings
    // =========================================================================
    console.log('Seeding bookings...');
    await Booking.bulkCreate([
      {
        id: BOOKING_1_ID,
        booking_number: 'BK-20260225-001',
        customer_id: USER_3_ID,
        salon_id: SALON_1_ID,
        stylist_member_id: MEMBER_3_ID,
        booking_date: formatDate(tomorrow),
        start_time: '10:00',
        end_time: '10:30',
        total_duration_minutes: 30,
        subtotal: 300.00,
        discount_amount: 0,
        total_amount: 300.00,
        payment_mode: 'pay_at_salon',
        payment_status: 'pending',
        status: 'confirmed',
        customer_notes: 'Regular haircut, short on sides.',
      },
      {
        id: BOOKING_2_ID,
        booking_number: 'BK-20260223-001',
        customer_id: USER_4_ID,
        salon_id: SALON_2_ID,
        stylist_member_id: MEMBER_4_ID,
        booking_date: formatDate(yesterday),
        start_time: '14:00',
        end_time: '15:00',
        total_duration_minutes: 60,
        subtotal: 1200.00,
        discount_amount: 0,
        total_amount: 1200.00,
        payment_mode: 'pay_at_salon',
        payment_status: 'paid',
        status: 'completed',
      },
      {
        id: BOOKING_3_ID,
        booking_number: 'BK-20260226-001',
        customer_id: USER_3_ID,
        salon_id: SALON_2_ID,
        stylist_member_id: MEMBER_4_ID,
        booking_date: formatDate(dayAfterTomorrow),
        start_time: '11:00',
        end_time: '11:45',
        total_duration_minutes: 45,
        subtotal: 500.00,
        discount_amount: 0,
        total_amount: 500.00,
        payment_mode: 'pay_at_salon',
        payment_status: 'pending',
        status: 'pending',
      },
    ]);
    console.log('Bookings seeded (3 records)');

    // =========================================================================
    // 9. Booking Services
    // =========================================================================
    console.log('Seeding booking services...');
    await BookingService.bulkCreate([
      {
        id: uuidv4(),
        booking_id: BOOKING_1_ID,
        service_id: SVC_S1_HAIRCUT_ID,
        service_name: 'Haircut',
        price: 300.00,
        duration_minutes: 30,
      },
      {
        id: uuidv4(),
        booking_id: BOOKING_2_ID,
        service_id: SVC_S2_HAIR_SPA_ID,
        service_name: 'Hair Spa',
        price: 1200.00,
        duration_minutes: 60,
      },
      {
        id: uuidv4(),
        booking_id: BOOKING_3_ID,
        service_id: SVC_S2_WOMENS_HAIRCUT_ID,
        service_name: "Women's Haircut",
        price: 500.00,
        duration_minutes: 45,
      },
    ]);
    console.log('Booking services seeded (3 records)');

    // =========================================================================
    // 10. Reviews
    // =========================================================================
    console.log('Seeding reviews...');
    await Review.bulkCreate([
      {
        id: uuidv4(),
        booking_id: BOOKING_2_ID,
        customer_id: USER_4_ID,
        salon_id: SALON_2_ID,
        stylist_member_id: MEMBER_4_ID,
        salon_rating: 5,
        stylist_rating: 4,
        comment: 'Amazing experience! Loved the hair spa treatment.',
        photos: [],
        is_visible: true,
      },
    ]);
    console.log('Reviews seeded (1 record)');

    // =========================================================================
    // 11. Notifications
    // =========================================================================
    console.log('Seeding notifications...');
    await Notification.bulkCreate([
      {
        id: uuidv4(),
        user_id: USER_3_ID,
        title: 'Booking Confirmed',
        body: 'Your booking at Urban Edge Salon is confirmed for tomorrow.',
        type: 'booking_confirmed',
        data: { booking_id: BOOKING_1_ID, salon_id: SALON_1_ID },
        is_read: false,
      },
      {
        id: uuidv4(),
        user_id: USER_4_ID,
        title: 'Leave a Review',
        body: 'Thanks for visiting Glamour Studio! Leave a review.',
        type: 'review_reminder',
        data: { booking_id: BOOKING_2_ID, salon_id: SALON_2_ID },
        is_read: false,
      },
    ]);
    console.log('Notifications seeded (2 records)');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n========================================');
    console.log('  Seed completed successfully!');
    console.log('========================================');
    console.log('  Service Categories : 5');
    console.log('  Users              : 6');
    console.log('  Salons             : 2');
    console.log('  Salon Members      : 4');
    console.log('  Services           : 10');
    console.log('  Stylist Availability: 14');
    console.log('  Stylist Services   : 10');
    console.log('  Bookings           : 3');
    console.log('  Booking Services   : 3');
    console.log('  Reviews            : 1');
    console.log('  Notifications      : 2');
    console.log('========================================');
    console.log('  Total records      : 60');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seed();
