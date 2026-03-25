# Saloon Backend

## Project Overview
Shared backend API for the Saloon marketplace platform (salon appointment booking). Serves both the **customer app** (salon-user) and **salon owner app** (salon-owner).

## Tech Stack
- **Runtime**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (Supabase-hosted) + Sequelize ORM
- **Payment**: Razorpay Route (marketplace split-payment)
- **Auth**: JWT (OTP-based phone login, test OTP: 1111 in dev)
- **Push**: Firebase Cloud Messaging
- **Chat**: Supabase Realtime
- **Storage**: Wasabi S3

## Architecture
- **Marketplace model**: Platform collects payments → holds in escrow → weekly settlement to salons (10% commission)
- **Razorpay Route**: Linked accounts per salon, direct transfers for settlement, webhook-driven state machine
- **Settlement**: Weekly cron (Wed 2AM), 72-hour buffer, saga pattern for transfers

## Key Commands
```bash
npm install          # Install deps
npm run dev          # Start dev server (port 3000, hot reload)
npm run seed         # Seed test data (6 users, 2 salons, services, bookings)
npm run build        # Compile TypeScript
npm start            # Run compiled JS
```

## Project Structure
```
src/
├── controllers/     # Route handlers (booking, payment, webhook, onboarding, admin, refund)
├── models/          # Sequelize models (21 models)
├── routes/          # Express route definitions
├── services/        # Business logic (razorpay, settlement, pricing, refund, scheduling, notification)
├── jobs/            # Cron jobs (settlement, auto-complete, incentive, webhook-replay, archival, payment-expiry)
├── middleware/      # Auth (JWT), validation, error handling
├── validators/      # Express-validator schemas
├── utils/           # Helpers, audit logger, earning helper
├── types/           # TypeScript interfaces
└── config/          # Environment config, database connection
```

## Key Flows
1. **Booking + Payment**: `POST /bookings/pay-and-book` → creates booking (awaiting_payment, 10-min hold) + Razorpay order → payment verified → booking confirmed
2. **Settlement**: Weekly cron gathers completed+paid bookings → deducts 10% commission → direct transfer to salon bank via Razorpay Route
3. **Webhooks**: `POST /webhooks/razorpay` — handles payment.captured/failed, transfer events, refund, account status changes. Always returns 200. Idempotent via WebhookEvent table.
4. **Refund**: Pre-transfer → Razorpay refund API. Post-transfer → negative adjustment in next settlement.

## Test Users (Seed Data)
| Phone | Name | Role |
|-------|------|------|
| 9999999001 | Arjun Mehta | Salon Owner (Urban Edge) |
| 9999999002 | Priya Sharma | Salon Owner (Glamour Studio) |
| 9999999003 | Rahul Verma | Customer |
| 9999999004 | Sneha Patel | Customer |
| OTP is always `1111` in development |

## Environment
- Copy `.env.example` to `.env` and fill in values
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` required for payments
- `RUN_CRON=false` to disable cron jobs during development
- `PLATFORM_COMMISSION_PERCENT=10` (10% marketplace commission)

## Coding Conventions
- Models use `const X: any = sequelize.define(...)` pattern
- Controllers are static class methods
- All API responses use `ApiResponse.success()` / `ApiResponse.created()` / `ApiResponse.paginated()`
- Errors use `ApiError.badRequest()` / `ApiError.notFound()` etc.
- Payment amounts: stored as INR (DECIMAL 10,2) in DB, converted to paise for Razorpay (`toPaise()` / `fromPaise()`)
- All Razorpay API calls go through `RazorpayService` singleton (never call SDK directly)
- Idempotency: webhook events use findOrCreate, settlements use idempotency keys, payments check existing orders

## Related Repos
- **salon-user**: Flutter customer app (github.com/mihir-kanzariya/salon-user)
- **salon-owner**: Flutter salon owner app (github.com/mihir-kanzariya/salon-owner)
