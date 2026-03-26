import crypto from 'crypto';
import { PaginationParams } from '../types';

export const generateOTP = (length = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg: number): number => deg * (Math.PI / 180);

export const generateTimeSlots = (startTime: string, endTime: string, intervalMinutes: number): string[] => {
  const slots: string[] = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + intervalMinutes <= endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    );
    currentMinutes += intervalMinutes;
  }

  return slots;
};

export const parsePagination = (query: any): PaginationParams => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const sanitizePhone = (phone: string | undefined | null): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.length === 10 ? digits : null;
};

export const generateBookingNumber = (): string => {
  // Use the new TX ID format for consistency
  const { generateTxId } = require('./id-generator');
  return generateTxId('BK');
};

export const addMinutesToTime = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const clampedMinutes = Math.min(totalMinutes, 24 * 60); // Cap at 24:00
  const newH = Math.floor(clampedMinutes / 60);
  const newM = clampedMinutes % 60;
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
};

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
