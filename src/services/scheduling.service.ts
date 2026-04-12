import { Op } from 'sequelize';
import { generateTimeSlots, timeToMinutes, addMinutesToTime } from '../utils/helpers';

import Booking from '../models/Booking';
import StylistAvailability from '../models/StylistAvailability';
import StylistBreak from '../models/StylistBreak';
import StylistLeave from '../models/StylistLeave';
import SalonMember from '../models/SalonMember';
import Salon from '../models/Salon';

interface TimeSlot {
  time: string;
  end_time: string;
  available: boolean;
}

interface AvailableStylist {
  salon_member_id: string;
  user_id: string;
  name: string;
  available_slots: string[];
}

export class SchedulingService {
  /**
   * Get available time slots for a salon on a given date.
   * Considers stylist availability, breaks, leaves, and existing bookings.
   */
  static async getAvailableSlots(
    salonId: string,
    date: string,
    totalDurationMinutes: number,
    stylistMemberId?: string
  ): Promise<TimeSlot[]> {
    const salon = await Salon.findByPk(salonId);
    if (!salon) throw new Error('Salon not found');

    if (!totalDurationMinutes || totalDurationMinutes <= 0) return [];

    // Enforce advance booking window
    const advanceDays = salon.booking_settings?.advance_booking_days ?? 15;
    const requestedDate = new Date(date + 'T00:00:00+05:30'); // Parse in IST
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + advanceDays);
    maxDate.setHours(23, 59, 59, 999);

    if (requestedDate > maxDate) {
      return [];
    }

    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toLowerCase();
    const operatingHours = salon.operating_hours?.[dayOfWeek];

    // No hours defined for this day, or explicitly closed
    if (!operatingHours || !operatingHours.open || !operatingHours.close) {
      return [];
    }
    const isClosed = operatingHours.is_closed === true || operatingHours.is_open === false;
    if (isClosed) {
      return [];
    }

    // Check if it's a holiday
    if (salon.holidays.includes(date)) {
      return [];
    }

    const slotDuration = Math.max(1, salon.booking_settings?.slot_duration_minutes || 15);
    const buffer = Math.max(0, salon.booking_settings?.buffer_between_bookings_minutes ?? 5);
    const allSlots = generateTimeSlots(operatingHours.open, operatingHours.close, slotDuration);

    // Get stylists to check
    const stylistFilter: any = {
      salon_id: salonId,
      role: 'stylist',
      is_active: true,
    };
    if (stylistMemberId) {
      stylistFilter.id = stylistMemberId;
    }

    const stylists = await SalonMember.findAll({ where: stylistFilter });

    if (stylists.length === 0) {
      return allSlots.map((time: string) => ({ time, end_time: addMinutesToTime(time, totalDurationMinutes), available: false }));
    }

    const stylistIds = stylists.map((s: any) => s.id);

    // Batch-fetch all data upfront to avoid N+1 queries
    const [leaves, availabilities, breaks, existingBookings] = await Promise.all([
      StylistLeave.findAll({
        where: { salon_member_id: { [Op.in]: stylistIds }, date },
      }),
      StylistAvailability.findAll({
        where: { salon_member_id: { [Op.in]: stylistIds }, day_of_week: dayOfWeek },
      }),
      StylistBreak.findAll({
        where: {
          salon_member_id: { [Op.in]: stylistIds },
          [Op.or]: [
            { break_type: 'recurring', day_of_week: dayOfWeek },
            { break_type: 'one_time', specific_date: date },
          ],
        },
      }),
      Booking.findAll({
        where: {
          stylist_member_id: { [Op.in]: stylistIds },
          booking_date: date,
          status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
        },
        attributes: ['stylist_member_id', 'start_time', 'end_time'],
      }),
    ]);

    // Index data by stylist ID for O(1) lookups
    const leaveSet = new Set(leaves.map((l: any) => l.salon_member_id));
    const availMap: Map<string, any> = new Map(availabilities.map((a: any) => [a.salon_member_id, a]));
    const breakMap = new Map<string, any[]>();
    for (const brk of breaks) {
      const list = breakMap.get(brk.salon_member_id) || [];
      list.push(brk);
      breakMap.set(brk.salon_member_id, list);
    }
    const bookingMap = new Map<string, any[]>();
    for (const bk of existingBookings) {
      const list = bookingMap.get(bk.stylist_member_id) || [];
      list.push(bk);
      bookingMap.set(bk.stylist_member_id, list);
    }

    const result: TimeSlot[] = [];

    for (const slot of allSlots) {
      const slotEndWithBuffer = addMinutesToTime(slot, totalDurationMinutes + buffer);
      const slotStartMin = timeToMinutes(slot);
      const slotEndMin = timeToMinutes(slotEndWithBuffer);

      let isAvailable = false;

      for (const stylist of stylists) {
        const sid = stylist.id;

        // 1. Check leave
        if (leaveSet.has(sid)) continue;

        // 2. Check availability
        const avail = availMap.get(sid);
        if (!avail || !avail.is_available) continue;
        const availStart = timeToMinutes(avail.start_time);
        const availEnd = timeToMinutes(avail.end_time);
        if (slotStartMin < availStart || slotEndMin > availEnd) continue;

        // 3. Check breaks
        const stylistBreaks = breakMap.get(sid) || [];
        let hasBreakConflict = false;
        for (const brk of stylistBreaks) {
          const breakStart = timeToMinutes(brk.start_time);
          const breakEnd = timeToMinutes(brk.end_time);
          if (slotStartMin < breakEnd && slotEndMin > breakStart) {
            hasBreakConflict = true;
            break;
          }
        }
        if (hasBreakConflict) continue;

        // 4. Check existing bookings
        const stylistBookings = bookingMap.get(sid) || [];
        let hasBookingConflict = false;
        for (const bk of stylistBookings) {
          const bkStart = timeToMinutes(bk.start_time);
          const bkEnd = timeToMinutes(bk.end_time);
          if (slotStartMin < bkEnd && slotEndMin > bkStart) {
            hasBookingConflict = true;
            break;
          }
        }
        if (hasBookingConflict) continue;

        isAvailable = true;
        break;
      }

      const slotEnd = addMinutesToTime(slot, totalDurationMinutes);
      result.push({ time: slot, end_time: slotEnd, available: isAvailable });
    }

    return result;
  }

  /**
   * Check if a specific stylist is available at a given date/time.
   */
  static async isStylistAvailable(
    stylistMemberId: string,
    date: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string
  ): Promise<boolean> {
    // 1. Check leave
    const leave = await StylistLeave.findOne({
      where: { salon_member_id: stylistMemberId, date },
    });
    if (leave) return false;

    // 2. Check weekly availability
    const availability = await StylistAvailability.findOne({
      where: { salon_member_id: stylistMemberId, day_of_week: dayOfWeek },
    });
    if (!availability || !availability.is_available) return false;

    // Check if slot falls within availability window
    const availStart = timeToMinutes(availability.start_time);
    const availEnd = timeToMinutes(availability.end_time);
    const slotStart = timeToMinutes(startTime);
    const slotEnd = timeToMinutes(endTime);

    if (slotStart < availStart || slotEnd > availEnd) return false;

    // 3. Check breaks
    const breaks = await StylistBreak.findAll({
      where: {
        salon_member_id: stylistMemberId,
        [Op.or]: [
          { break_type: 'recurring', day_of_week: dayOfWeek },
          { break_type: 'one_time', specific_date: date },
        ],
      },
    });

    for (const brk of breaks) {
      const breakStart = timeToMinutes(brk.start_time);
      const breakEnd = timeToMinutes(brk.end_time);
      // Check overlap
      if (slotStart < breakEnd && slotEnd > breakStart) {
        return false;
      }
    }

    // 4. Check existing bookings
    const existingBooking = await Booking.findOne({
      where: {
        stylist_member_id: stylistMemberId,
        booking_date: date,
        status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
        [Op.or]: [
          {
            start_time: { [Op.lt]: endTime },
            end_time: { [Op.gt]: startTime },
          },
        ],
      },
    });

    return !existingBooking;
  }

  /**
   * Auto-assign the best available stylist for a booking.
   * Picks the stylist with the fewest bookings on that date (load balancing).
   * C.2: Batch-fetches all data upfront to avoid N+1 queries.
   */
  static async autoAssignStylist(
    salonId: string,
    date: string,
    startTime: string,
    endTime: string,
    serviceIds: string[]
  ): Promise<string | null> {
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const stylists = await SalonMember.findAll({
      where: { salon_id: salonId, role: 'stylist', is_active: true },
    });

    if (stylists.length === 0) return null;

    const stylistIds = stylists.map((s: any) => s.id);
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);

    // Batch-fetch all data upfront (same pattern as getAvailableSlots)
    const [leaves, availabilities, breaks, existingBookings, bookingCounts] = await Promise.all([
      StylistLeave.findAll({
        where: { salon_member_id: { [Op.in]: stylistIds }, date },
      }),
      StylistAvailability.findAll({
        where: { salon_member_id: { [Op.in]: stylistIds }, day_of_week: dayOfWeek },
      }),
      StylistBreak.findAll({
        where: {
          salon_member_id: { [Op.in]: stylistIds },
          [Op.or]: [
            { break_type: 'recurring', day_of_week: dayOfWeek },
            { break_type: 'one_time', specific_date: date },
          ],
        },
      }),
      Booking.findAll({
        where: {
          stylist_member_id: { [Op.in]: stylistIds },
          booking_date: date,
          status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
        },
        attributes: ['stylist_member_id', 'start_time', 'end_time'],
      }),
      // Single GROUP BY query for booking counts
      Booking.findAll({
        where: {
          stylist_member_id: { [Op.in]: stylistIds },
          booking_date: date,
          status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
        },
        attributes: [
          'stylist_member_id',
          [Booking.sequelize!.fn('COUNT', Booking.sequelize!.col('id')), 'count'],
        ],
        group: ['stylist_member_id'],
        raw: true,
      }),
    ]);

    // Index data by stylist ID
    const leaveSet = new Set(leaves.map((l: any) => l.salon_member_id));
    const availMap: Map<string, any> = new Map(availabilities.map((a: any) => [a.salon_member_id, a]));
    const breakMap = new Map<string, any[]>();
    for (const brk of breaks) {
      const list = breakMap.get(brk.salon_member_id) || [];
      list.push(brk);
      breakMap.set(brk.salon_member_id, list);
    }
    const bookingMap = new Map<string, any[]>();
    for (const bk of existingBookings) {
      const list = bookingMap.get(bk.stylist_member_id) || [];
      list.push(bk);
      bookingMap.set(bk.stylist_member_id, list);
    }
    const countMap = new Map<string, number>();
    for (const row of bookingCounts as any[]) {
      countMap.set(row.stylist_member_id, parseInt(row.count, 10));
    }

    const availableStylists: { memberId: string; bookingCount: number }[] = [];

    for (const stylist of stylists) {
      const sid = stylist.id;

      // 1. Check leave
      if (leaveSet.has(sid)) continue;

      // 2. Check availability
      const avail = availMap.get(sid);
      if (!avail || !avail.is_available) continue;
      const availStart = timeToMinutes(avail.start_time);
      const availEnd = timeToMinutes(avail.end_time);
      if (startMin < availStart || endMin > availEnd) continue;

      // 3. Check breaks
      const stylistBreaks = breakMap.get(sid) || [];
      let hasBreakConflict = false;
      for (const brk of stylistBreaks) {
        const brkStart = timeToMinutes(brk.start_time);
        const brkEnd = timeToMinutes(brk.end_time);
        if (startMin < brkEnd && endMin > brkStart) {
          hasBreakConflict = true;
          break;
        }
      }
      if (hasBreakConflict) continue;

      // 4. Check existing bookings
      const stylistBookings = bookingMap.get(sid) || [];
      let hasBookingConflict = false;
      for (const bk of stylistBookings) {
        const bkStart = timeToMinutes(bk.start_time);
        const bkEnd = timeToMinutes(bk.end_time);
        if (startMin < bkEnd && endMin > bkStart) {
          hasBookingConflict = true;
          break;
        }
      }
      if (hasBookingConflict) continue;

      availableStylists.push({ memberId: sid, bookingCount: countMap.get(sid) || 0 });
    }

    if (availableStylists.length === 0) return null;

    // Sort by fewest bookings
    availableStylists.sort((a, b) => a.bookingCount - b.bookingCount);
    return availableStylists[0].memberId;
  }
}
