import { z } from 'zod';
import {
  BookingLocation,
  ContactChannel,
  ListingType,
  OrganizationType,
  PriceType,
  ProviderType,
  ReportReason,
  ReportTarget,
  ServiceMode,
  StockStatus,
  Visibility,
} from './enums';

const values = <T extends Record<string, string>>(o: T) => Object.values(o) as [T[keyof T], ...T[keyof T][]];

const ZM_LOCAL = /^0[79]\d{8}$/;
const ZM_BARE = /^[79]\d{8}$/;
const ZM_INTL = /^\+260[79]\d{8}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/** Normalises a phone number to E.164. Zambian local numbers get +260. */
export function normalizePhone(input: string): string {
  const v = input.replace(/[\s()-]/g, '');
  if (ZM_LOCAL.test(v)) return `+260${v.slice(1)}`;
  if (ZM_BARE.test(v)) return `+260${v}`;
  return v;
}

export function isValidPhone(input: string): boolean {
  const v = normalizePhone(input);
  if (v.startsWith('+260')) return ZM_INTL.test(v);
  return E164.test(v);
}

/** Zambian mobile numbers (097…, 096…, 095…, 077…, 076…) or any E.164 number. Output is E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .refine(isValidPhone, { message: 'Enter a valid phone number, e.g. 0971234567 or +260971234567' })
  .transform(normalizePhone);

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: phoneSchema.optional().or(z.literal('')),
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: passwordSchema });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  bio: optionalText(500),
  locationName: optionalText(120),
  avatarMediaId: z.string().uuid().nullable().optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const workingHoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      open: z.string().regex(/^\d{2}:\d{2}$/),
      close: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  )
  .max(14);
export type WorkingHours = z.infer<typeof workingHoursSchema>;

export const providerSchema = z.object({
  type: z.enum(values(ProviderType)),
  displayName: z.string().trim().min(2, 'Enter a name').max(120),
  tagline: optionalText(140),
  bio: optionalText(3000),
  phone: phoneSchema,
  whatsapp: phoneSchema.optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  website: z.string().trim().url('Enter a full URL').optional().or(z.literal('')),
  socialLinks: z.record(z.string(), z.string().url()).optional(),
  serviceMode: z.enum(values(ServiceMode)),
  serviceRadiusKm: z.number().min(0).max(200).nullable().optional(),
  workingHours: workingHoursSchema.optional(),
  languages: z.array(z.string().max(40)).max(10).optional(),
  logoMediaId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
});
export type ProviderInput = z.input<typeof providerSchema>;

export const providerLocationSchema = z.object({
  label: z.string().trim().min(1).max(80),
  addressLine: optionalText(200),
  area: z.string().trim().min(1, 'Enter the neighbourhood').max(80),
  city: z.string().trim().min(1, 'Enter the town or city').max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isPrimary: z.boolean().default(false),
  /** When false only an approximate (~500 m) position and the area name are shown publicly. */
  showExactLocation: z.boolean().default(false),
});
export type ProviderLocationInput = z.input<typeof providerLocationSchema>;

export const serviceAreaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.5).max(200),
});
export type ServiceAreaInput = z.input<typeof serviceAreaSchema>;

const PRICED = ['FIXED', 'STARTING_FROM', 'RANGE', 'HOURLY', 'PER_UNIT'];

export const listingBaseSchema = z.object({
  type: z.enum(values(ListingType)),
  title: z.string().trim().min(3, 'Enter a title').max(120),
  description: optionalText(3000),
  categoryId: z.string().uuid('Choose a category'),
  priceType: z.enum(values(PriceType)),
  price: z.number().nonnegative().max(100_000_000).nullable().optional(),
  priceMax: z.number().nonnegative().max(100_000_000).nullable().optional(),
  currency: z.string().length(3).default('ZMW'),
  unit: optionalText(30),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  locationId: z.string().uuid().nullable().optional(),
  visibility: z.enum(values(Visibility)).default('PUBLIC'),
  organizationId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  isAvailable: z.boolean().default(true),
  durationMinutes: z.number().int().positive().max(60 * 24 * 30).nullable().optional(),
  stockStatus: z.enum(StockStatus).nullable().optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  deliveryRadiusKm: z.number().min(0).max(500).nullable().optional(),
  mediaIds: z.array(z.string().uuid()).max(12).default([]),
  publish: z.boolean().default(true),
});

export function refineListing(
  v: Partial<z.infer<typeof listingBaseSchema>>,
  ctx: z.RefinementCtx,
): void {
  if (v.priceType && PRICED.includes(v.priceType) && (v.price === null || v.price === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Enter a price' });
  }
  if (v.priceType === 'RANGE' && (v.priceMax == null || (v.price != null && v.priceMax < v.price))) {
    ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'Enter a maximum at least the minimum' });
  }
  if (v.visibility === 'ORGANIZATION' && !v.organizationId) {
    ctx.addIssue({ code: 'custom', path: ['organizationId'], message: 'Choose an organization' });
  }
  if (v.visibility === 'GROUP' && (!v.organizationId || !v.groupId)) {
    ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Choose a group' });
  }
  if (v.visibility === 'PUBLIC' && v.groupId) {
    ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'A public listing cannot be limited to a group' });
  }
}

export const listingSchema = listingBaseSchema.superRefine(refineListing);
export type ListingInput = z.input<typeof listingSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(2000),
  listingId: z.string().uuid().nullable().optional(),
  mediaIds: z.array(z.string().uuid()).max(4).default([]),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const reviewResponseSchema = z.object({ body: z.string().trim().min(2).max(1000) });

export const contactEventSchema = z.object({
  channel: z.enum(values(ContactChannel)),
  listingId: z.string().uuid().nullable().optional(),
});

export const enquirySchema = z.object({
  message: z.string().trim().min(5, 'Write a short message').max(1000),
  listingId: z.string().uuid().nullable().optional(),
  contactPhone: phoneSchema.optional().or(z.literal('')),
});
export type EnquiryInput = z.input<typeof enquirySchema>;

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  type: z.enum(OrganizationType),
  description: optionalText(2000),
  isPrivate: z.boolean().default(false),
  locationName: optionalText(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  logoMediaId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
});
export type OrganizationInput = z.input<typeof organizationSchema>;

export const groupSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  description: optionalText(1000),
  isPrivate: z.boolean().default(false),
});
export type GroupInput = z.input<typeof groupSchema>;

export const reportSchema = z.object({
  targetType: z.enum(values(ReportTarget)),
  targetId: z.string().uuid(),
  reason: z.enum(ReportReason),
  details: optionalText(1000),
});
export type ReportInput = z.input<typeof reportSchema>;

export const portfolioProjectSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title').max(120),
  description: optionalText(2000),
  locationName: optionalText(120),
  durationText: optionalText(60),
  price: z.number().nonnegative().nullable().optional(),
  showPrice: z.boolean().default(false),
  completedAt: z.string().datetime().nullable().optional(),
  mediaIds: z.array(z.string().uuid()).min(1, 'Add at least one photo or video').max(20),
});
export type PortfolioProjectInput = z.input<typeof portfolioProjectSchema>;

export const bookingRequestSchema = z
  .object({
    providerId: z.string().uuid(),
    listingId: z.string().uuid().nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    location: z.enum(BookingLocation).default('AT_PROVIDER'),
    address: optionalText(300),
    note: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.location === 'AT_CUSTOMER' && !v.address?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Tell the provider where to come' });
    }
  });
export type BookingRequestInput = z.input<typeof bookingRequestSchema>;

export const bookingRescheduleSchema = z.object({ scheduledAt: z.string().datetime({ offset: true }), reason: optionalText(300) });
export const bookingReasonSchema = z.object({ reason: optionalText(300) });

export const messageSchema = z
  .object({
    body: z.string().trim().max(2000).default(''),
    mediaId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.mediaId, { message: 'Write a message', path: ['body'] });
export type MessageInput = z.input<typeof messageSchema>;

/** Zambian mobile-money numbers (MTN 096/076, Airtel 097/077/057, Zamtel 095/075/021). */
export const MOBILE_MONEY_PHONE = /^\+260(9[567]|7[567]|57|21)\d{7}$/;
export const PLAN_TERMS_MONTHS = [1, 3, 6, 12] as const;

export const planCheckoutSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  months: z.coerce
    .number()
    .int()
    .refine((m) => (PLAN_TERMS_MONTHS as readonly number[]).includes(m), { message: 'Choose 1, 3, 6 or 12 months' }),
  phone: phoneSchema.refine((p) => MOBILE_MONEY_PHONE.test(p), { message: 'Enter an MTN, Airtel or Zamtel number, e.g. 0961234567' }),
});

/** Phone sign-in (SMS code). Zambian mobile numbers only: codes are sent through Zamtel Bulk SMS. */
export const ZM_MOBILE = /^\+260[79]\d{8}$/;
export const OTP_CODE_LENGTH = 6;
const zambianMobile = phoneSchema.refine((p) => ZM_MOBILE.test(p), { message: 'Enter a Zambian mobile number, e.g. 0971234567' });
export const phoneStartSchema = z.object({ phone: zambianMobile });
export const phoneVerifySchema = z.object({
  phone: zambianMobile,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
