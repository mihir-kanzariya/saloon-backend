import { Op } from 'sequelize';
import Booking from '../models/Booking';
import Salon from '../models/Salon';
import { SchedulingService } from './scheduling.service';
import { timeToMinutes, addMinutesToTime } from '../utils/helpers';

interface Gap {
  start: number;       // minutes from midnight
  end: number;         // minutes from midnight
  duration: number;    // minutes
  leftEdge: 'salon_open' | 'after_booking';
  rightEdge: 'before_booking' | 'salon_close';
  leftBookingEnd?: string;   // HH:MM of left booking end
  rightBookingStart?: string; // HH:MM of right booking start
}

interface SmartSlot {
  time: string;           // HH:MM
  endTime: string;        // HH:MM
  available: boolean;
  slotType: 'perfect_fit' | 'smart' | 'regular';
  discount: number;       // percentage (0 or 10)
  discountAmount: number; // rupees
  originalPrice: number;
  finalPrice: number;
  reason: string | null;
  // 'first_available' | 'right_after_booking' | 'right_before_booking' |
  // 'last_slot' | 'fills_gap_perfectly' | null
}

interface PeriodStats {
  available: number;
  total: number;
}

interface SmartSlotsResponse {
  slots: SmartSlot[];
  summary: {
    totalSlots: number;
    availableSlots: number;
    smartSlots: number;
    perfectFitSlots: number;
    regularSlots: number;
    utilization: number;
    bookedSlots?: number;
    totalPossibleSlots?: number;
    earlyMorning?: PeriodStats;
    morning?: PeriodStats;
    afternoon?: PeriodStats;
    evening?: PeriodStats;
  };
}

export class SmartSchedulingService {

  /**
   * Main entry point: returns all available slots with smart pricing.
   */
  static async getSmartSlots(params: {
    salonId: string;
    date: string;
    serviceDuration: number;
    servicePrice: number;
    stylistMemberId?: string;
    displayInterval?: number;
  }): Promise<SmartSlotsResponse> {
    const { salonId, date, serviceDuration, servicePrice, stylistMemberId, displayInterval } = params;

    // 1. Get salon config
    const salon = await Salon.findByPk(salonId);
    if (!salon || !salon.is_active) {
      return { slots: [], summary: { totalSlots: 0, availableSlots: 0, smartSlots: 0, perfectFitSlots: 0, regularSlots: 0, utilization: 0 } };
    }

    const settings = salon.booking_settings || {};
    const buffer = settings.buffer_between_bookings_minutes || 5;
    const slotInterval = settings.slot_duration_minutes || 15;
    const discountPercent = settings.smart_slot_discount ?? 10;
    const smartEnabled = settings.smart_slot_enabled !== false; // default true

    // 2. Get operating hours for this day
    const requestedDate = new Date(date + 'T00:00:00+05:30');
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toLowerCase();
    const hours = salon.operating_hours?.[dayOfWeek];

    if (!hours) return this.emptyResponse();
    const isClosed = hours.is_closed === true || hours.is_open === false;
    if (isClosed) return this.emptyResponse();
    if (salon.holidays?.includes(date)) return this.emptyResponse();

    const openMin = timeToMinutes(hours.open);
    const closeMin = timeToMinutes(hours.close);
    const totalWorkingMin = closeMin - openMin;

    // 3. Get raw available slots from existing system (respects stylist availability, breaks, leaves)
    const rawSlots = await SchedulingService.getAvailableSlots(salonId, date, serviceDuration, stylistMemberId);

    // 4. Get existing bookings for gap calculation
    const bookingWhere: any = {
      salon_id: salonId,
      booking_date: date,
      status: { [Op.in]: ['awaiting_payment', 'pending', 'confirmed', 'in_progress'] },
    };
    if (stylistMemberId) {
      bookingWhere.stylist_member_id = stylistMemberId;
    }
    const bookings = await Booking.findAll({
      where: bookingWhere,
      attributes: ['start_time', 'end_time', 'total_duration_minutes'],
      order: [['start_time', 'ASC']],
    });

    // 5. Calculate gaps
    const gaps = this.calculateGaps(bookings, openMin, closeMin, buffer);

    // 6. Calculate booked minutes for utilization
    const bookedMin = bookings.reduce((sum: number, b: any) => sum + (b.total_duration_minutes || 0), 0);
    const utilization = totalWorkingMin > 0 ? bookedMin / totalWorkingMin : 0;

    // 7. If smart scheduling disabled, return raw slots without pricing
    if (!smartEnabled || discountPercent <= 0) {
      const slots: SmartSlot[] = rawSlots.map((s: any) => ({
        time: s.time,
        endTime: addMinutesToTime(s.time, serviceDuration),
        available: s.available,
        slotType: 'regular' as const,
        discount: 0,
        discountAmount: 0,
        originalPrice: servicePrice,
        finalPrice: servicePrice,
        reason: null,
      }));
      return {
        slots,
        summary: {
          totalSlots: slots.length,
          availableSlots: slots.filter(s => s.available).length,
          smartSlots: 0,
          perfectFitSlots: 0,
          regularSlots: slots.filter(s => s.available).length,
          utilization: Math.round(utilization * 100) / 100,
        },
      };
    }

    // 8. For same-day bookings, filter out past times
    let effectiveOpenMin = openMin;
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const nowMin = now.getHours() * 60 + now.getMinutes();
      effectiveOpenMin = Math.max(openMin, nowMin);
    }

    // 9. Classify each available slot
    const smartSlots: SmartSlot[] = [];
    const availableRaw = rawSlots.filter((s: any) => s.available);

    for (const raw of availableRaw) {
      const slotStartMin = timeToMinutes(raw.time);
      const slotEndMin = slotStartMin + serviceDuration;

      // Skip past slots for today
      if (slotStartMin < effectiveOpenMin) continue;

      // Find which gap this slot falls in
      let slotType: 'perfect_fit' | 'smart' | 'regular' = 'regular';
      let reason: string | null = null;

      for (const gap of gaps) {
        // Slot must fit entirely within this gap
        if (slotStartMin < gap.start || slotEndMin > gap.end) continue;

        // PERFECT FIT: service fills the entire gap (±buffer tolerance)
        if (gap.duration <= serviceDuration + buffer + slotInterval && gap.duration >= serviceDuration) {
          slotType = 'perfect_fit';
          reason = 'fills_gap_perfectly';
          break;
        }

        // TOUCHES LEFT EDGE: starts at or very near gap start
        if (slotStartMin - gap.start < slotInterval) {
          slotType = 'smart';
          reason = gap.leftEdge === 'salon_open' ? 'first_available' : 'right_after_booking';
          break;
        }

        // TOUCHES RIGHT EDGE: ends at or very near gap end
        if (gap.end - slotEndMin < slotInterval + buffer) {
          slotType = 'smart';
          reason = gap.rightEdge === 'salon_close' ? 'last_slot' : 'right_before_booking';
          break;
        }

        // Falls in this gap but doesn't touch edges → regular
        break;
      }

      // Special case: empty day, first slot = smart
      if (bookings.length === 0 && slotStartMin === effectiveOpenMin) {
        slotType = 'smart';
        reason = 'first_available';
      }

      const discount = slotType !== 'regular' ? discountPercent : 0;
      const discountAmount = Math.round(servicePrice * discount / 100);

      smartSlots.push({
        time: raw.time,
        endTime: addMinutesToTime(raw.time, serviceDuration),
        available: true,
        slotType,
        discount,
        discountAmount,
        originalPrice: servicePrice,
        finalPrice: servicePrice - discountAmount,
        reason,
      });
    }

    let allSlots = [...smartSlots].sort(
      (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
    );

    const smartCount = smartSlots.filter(s => s.slotType === 'smart').length;
    const perfectCount = smartSlots.filter(s => s.slotType === 'perfect_fit').length;

    // Filter to display interval — keep all smart/perfect_fit, thin out regular slots
    if (displayInterval && displayInterval > 0) {
      allSlots = allSlots.filter(s => {
        if (s.slotType !== 'regular') return true;
        const min = timeToMinutes(s.time);
        return min % displayInterval === 0;
      });
    }

    // Calculate period-level stats for scarcity display
    const periodStats = (fromHour: number, toHour: number) => {
      const periodRaw = rawSlots.filter((s: any) => {
        const h = parseInt(s.time.split(':')[0]);
        return h >= fromHour && h < toHour;
      });
      const periodAvailable = periodRaw.filter((s: any) => s.available).length;
      return { available: periodAvailable, total: periodRaw.length };
    };

    const morning = periodStats(6, 12);
    const afternoon = periodStats(12, 17);
    const evening = periodStats(17, 24);
    const earlyMorning = periodStats(0, 6);

    const bookedSlots = rawSlots.filter((s: any) => !s.available).length;
    const totalPossibleSlots = rawSlots.length;

    return {
      slots: allSlots,
      summary: {
        totalSlots: allSlots.length,
        availableSlots: smartSlots.length,
        smartSlots: smartCount,
        perfectFitSlots: perfectCount,
        regularSlots: smartSlots.length - smartCount - perfectCount,
        utilization: Math.round(utilization * 100) / 100,
        bookedSlots,
        totalPossibleSlots,
        earlyMorning,
        morning,
        afternoon,
        evening,
      },
    };
  }

  /**
   * Calculate gaps between bookings (and before first / after last).
   */
  static calculateGaps(bookings: any[], openMin: number, closeMin: number, buffer: number): Gap[] {
    const gaps: Gap[] = [];
    let prevEnd = openMin;

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time) + buffer;

      const gapDuration = bStart - prevEnd;
      if (gapDuration > 0) {
        gaps.push({
          start: prevEnd,
          end: bStart,
          duration: gapDuration,
          leftEdge: prevEnd === openMin ? 'salon_open' : 'after_booking',
          rightEdge: 'before_booking',
          rightBookingStart: b.start_time,
        });
      }

      prevEnd = Math.max(prevEnd, bEnd);
    }

    // Gap after last booking to salon close
    if (prevEnd < closeMin) {
      gaps.push({
        start: prevEnd,
        end: closeMin,
        duration: closeMin - prevEnd,
        leftEdge: bookings.length > 0 ? 'after_booking' : 'salon_open',
        rightEdge: 'salon_close',
        leftBookingEnd: bookings.length > 0 ? bookings[bookings.length - 1].end_time : undefined,
      });
    }

    return gaps;
  }

  /**
   * Verify that a slot is genuinely a smart slot at booking time.
   * Called during booking creation to prevent discount fraud.
   */
  static async verifySmartSlot(params: {
    salonId: string;
    date: string;
    startTime: string;
    serviceDuration: number;
    servicePrice: number;
    stylistMemberId?: string;
  }): Promise<{ isSmartSlot: boolean; slotType: string; discount: number; discountAmount: number; finalPrice: number }> {
    const result = await this.getSmartSlots(params);
    const match = result.slots.find(s => s.time === params.startTime && s.available);

    if (!match || match.slotType === 'regular') {
      return { isSmartSlot: false, slotType: 'regular', discount: 0, discountAmount: 0, finalPrice: params.servicePrice };
    }

    return {
      isSmartSlot: true,
      slotType: match.slotType,
      discount: match.discount,
      discountAmount: match.discountAmount,
      finalPrice: match.finalPrice,
    };
  }

  private static emptyResponse(): SmartSlotsResponse {
    return { slots: [], summary: { totalSlots: 0, availableSlots: 0, smartSlots: 0, perfectFitSlots: 0, regularSlots: 0, utilization: 0 } };
  }
}
