import type { CurrencyCode, Paginated } from '@pasta/types';

import type { HttpClient } from './http';

// --- tours -------------------------------------------------------------------

export interface TourSummary {
  id: string;
  slug: string;
  title: string;
  location: string;
  durationHours: number;
  priceMinor: number;
  currency: CurrencyCode;
  description: string;
  isBestseller: boolean;
  coverImage: string | null;
}

export interface TourPlanStep {
  title: string;
  description: string;
}

export interface TourImage {
  url: string;
  alt: string | null;
  isCover: boolean;
}

export interface TourDetail extends TourSummary {
  highlights: string[];
  included: string[];
  goodToKnow: string[];
  plan: TourPlanStep[];
  gallery: TourImage[];
  meetingPointTitle: string | null;
  meetingPointAddress: string | null;
  maxTicketsPerTour: number;
}

export interface TourSlot {
  id: string;
  time: string;
  available: boolean;
  remaining: number;
}

export interface AvailabilityDay {
  date: string;
  available: boolean;
}

export interface ListToursParams {
  q?: string;
  location?: string;
  sort?: 'popular' | 'price-asc' | 'price-desc' | 'duration' | 'newest';
  page?: number;
  limit?: number;
  /** Prices are returned in this currency. Defaults to EUR server-side. */
  currency?: CurrencyCode;
}

export class ToursResource {
  constructor(private readonly http: HttpClient) {}

  list(params: ListToursParams = {}): Promise<Paginated<TourSummary>> {
    return this.http.getPaginated<TourSummary>('/tours', { params });
  }

  bySlug(slug: string, currency?: CurrencyCode): Promise<TourDetail> {
    return this.http.get<TourDetail>(`/tours/${slug}`, { params: { currency } });
  }

  related(slug: string, currency?: CurrencyCode): Promise<TourSummary[]> {
    return this.http.get<TourSummary[]>(`/tours/${slug}/related`, { params: { currency } });
  }

  slots(slug: string, date: string): Promise<TourSlot[]> {
    return this.http.get<TourSlot[]>(`/tours/${slug}/slots`, { params: { date } });
  }

  availability(slug: string, from: string, days = 7): Promise<AvailabilityDay[]> {
    return this.http.get<AvailabilityDay[]>(`/tours/${slug}/availability`, {
      params: { from, days },
    });
  }
}

// --- locations ---------------------------------------------------------------

export interface Location {
  id: string;
  name: string;
  slug: string;
  country: string;
  tourCount: number;
}

export class LocationsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<Location[]> {
    return this.http.get<Location[]>('/locations');
  }
}

// --- blog --------------------------------------------------------------------

export interface BlogSummary {
  slug: string;
  title: string;
  excerpt: string;
  categories: string[];
  publishedAt: string | null;
  coverImage: string | null;
}

export interface BlogDetail extends BlogSummary {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
}

export interface BlogCategory {
  name: string;
  slug: string;
  count: number;
}

export interface ListPostsParams {
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export class BlogResource {
  constructor(private readonly http: HttpClient) {}

  list(params: ListPostsParams = {}): Promise<Paginated<BlogSummary>> {
    return this.http.getPaginated<BlogSummary>('/blog', { params });
  }

  bySlug(slug: string): Promise<BlogDetail> {
    return this.http.get<BlogDetail>(`/blog/${slug}`);
  }

  categories(): Promise<BlogCategory[]> {
    return this.http.get<BlogCategory[]>('/blog/categories');
  }
}

// --- auth --------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export class AuthResource {
  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Promise<LoginResponse> {
    return this.http.post<LoginResponse>('/auth/login', { email, password });
  }

  refresh(): Promise<LoginResponse> {
    return this.http.post<LoginResponse>('/auth/refresh');
  }

  logout(): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/auth/logout');
  }

  me(): Promise<AuthUser> {
    return this.http.get<AuthUser>('/auth/me');
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/auth/forgot-password', { email });
  }

  resetPassword(token: string, password: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/auth/reset-password', { token, password });
  }
}

/**
 * The SDK surface. One instance wraps a configured `HttpClient`, so callers
 * never construct URLs or unwrap envelopes by hand.
 */
export class PastaApi {
  readonly tours: ToursResource;
  readonly locations: LocationsResource;
  readonly blog: BlogResource;
  readonly auth: AuthResource;
  readonly cart: CartResource;
  readonly checkout: CheckoutResource;
  readonly admin: AdminResource;
  readonly bookings: BookingsResource;

  constructor(readonly http: HttpClient) {
    this.tours = new ToursResource(http);
    this.locations = new LocationsResource(http);
    this.blog = new BlogResource(http);
    this.auth = new AuthResource(http);
    this.cart = new CartResource(http);
    this.checkout = new CheckoutResource(http);
    this.admin = new AdminResource(http);
    this.bookings = new BookingsResource(http);
  }
}

// --- cart & checkout ---------------------------------------------------------

export interface CartItem {
  id: string;
  tourSlug: string;
  title: string;
  location: string;
  date: string;
  time: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  currency: CurrencyCode;
  remaining: number;
  maxTickets: number;
  priceChanged: boolean;
}

export interface Cart {
  items: CartItem[];
  totalTickets: number;
  subtotalMinor: number;
  bookingFeeMinor: number;
  totalMinor: number;
  currency: CurrencyCode;
}

export class CartResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * `currency` is the one the visitor is browsing in. It decides the symbols an
   * empty basket reports; a basket with items keeps its own currency until
   * `setCurrency` re-prices it.
   */
  get(currency?: CurrencyCode): Promise<Cart> {
    return this.http.get<Cart>('/cart', { params: { currency } });
  }

  add(slug: string, slotId: string, quantity: number, currency?: CurrencyCode): Promise<Cart> {
    return this.http.post<Cart>('/cart/items', { slug, slotId, quantity, currency });
  }

  /** Re-prices every line in `currency`. A basket is never mixed-currency. */
  setCurrency(currency: CurrencyCode): Promise<Cart> {
    return this.http.put<Cart>('/cart/currency', { currency });
  }

  updateQuantity(itemId: string, quantity: number, currency?: CurrencyCode): Promise<Cart> {
    return this.http.patch<Cart>(`/cart/items/${itemId}`, { quantity }, { params: { currency } });
  }

  remove(itemId: string, currency?: CurrencyCode): Promise<Cart> {
    return this.http.delete<Cart>(`/cart/items/${itemId}`, { params: { currency } });
  }

  clear(currency?: CurrencyCode): Promise<Cart> {
    return this.http.delete<Cart>('/cart', { params: { currency } });
  }
}

export interface TicketHolder {
  firstName: string;
  lastName: string;
}

export interface CheckoutPayload {
  fullName: string;
  email: string;
  ticketHolders: TicketHolder[];
}

export interface CheckoutResult {
  reference: string;
  bookingId: string;
  totalMinor: number;
  currency: CurrencyCode;
  status: string;
  paymentIntentClientSecret: string | null;
}

export class CheckoutResource {
  constructor(private readonly http: HttpClient) {}

  create(payload: CheckoutPayload): Promise<CheckoutResult> {
    return this.http.post<CheckoutResult>('/checkout', payload);
  }

  /**
   * Starts card payment. Returns the client secret the browser hands to
   * Stripe; card details never touch this application's server.
   */
  paymentIntent(reference: string): Promise<PaymentIntentResult> {
    return this.http.post<PaymentIntentResult>(`/checkout/${reference}/payment-intent`);
  }

  /** Polled after payment: the webhook, not the browser, confirms a booking. */
  status(reference: string): Promise<BookingPaymentStatus> {
    return this.http.get<BookingPaymentStatus>(`/checkout/${reference}/status`);
  }
}

export interface PaymentIntentResult {
  clientSecret: string;
  publishableKey: string | null;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface BookingPaymentStatus {
  reference: string;
  status: BookingStatusValue;
  paymentStatus: PaymentStatusValue;
}

// --- admin -------------------------------------------------------------------

export interface DashboardStats {
  totalBookings: number;
  totalRevenueMinor: number;
  totalCustomers: number;
  activeTours: number;
  pendingPayments: number;
}

export interface AdminTour {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  durationHours: number;
  priceUsdMinor: number;
  priceEurMinor: number;
  status: 'PUBLISHED' | 'DRAFT';
  coverImage: string | null;
  updatedAt: string;
}

/** The API only ever emits these values, so the union is exact. */
export type BookingStatusValue = 'CONFIRMED' | 'PENDING' | 'CANCELLED';
export type PaymentStatusValue = 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';

export interface AdminBooking {
  reference: string;
  customerName: string;
  customerEmail: string;
  tours: string[];
  tickets: number;
  totalMinor: number;
  currency: CurrencyCode;
  paymentStatus: PaymentStatusValue;
  status: BookingStatusValue;
  bookedAt: string;
}

export interface AdminBookingItem {
  id: string;
  tourId: string;
  title: string;
  /** The tour's current location and cover photo — presentational only. */
  location: string;
  coverImage: string | null;
  date: string;
  time: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  holders: string[];
}

export interface AdminBookingDetail {
  reference: string;
  status: BookingStatusValue;
  paymentStatus: PaymentStatusValue;
  bookedAt: string;
  currency: CurrencyCode;
  subtotalMinor: number;
  bookingFeeMinor: number;
  totalMinor: number;
  customer: { fullName: string; email: string };
  items: AdminBookingItem[];
  payment: {
    id: string;
    method: string;
    transactionId: string | null;
    amountMinor: number;
    paidAt: string | null;
    status: PaymentStatusValue;
    /**
     * False for Stripe-captured payments. Those are the processor's record and
     * the admin screen shows them read-only — the API rejects edits to them.
     */
    isManual: boolean;
  } | null;
  notes: { id: string; body: string; createdAt: string }[];
}

export interface AdminBlog {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  categories: string[];
  status: 'PUBLISHED' | 'DRAFT';
  publishedAt: string | null;
  updatedAt: string;
}

export interface TopTour {
  id: string | null;
  title: string;
  bookings: number;
  coverImage: string | null;
}

/** Advanced-filter bounds every listing accepts. */
export interface DateRangeParams {
  from?: string;
  to?: string;
}

export interface AdminPayment {
  id: string;
  bookingReference: string;
  customerName: string;
  method: string;
  transactionId: string | null;
  amountMinor: number;
  refundedMinor: number;
  currency: CurrencyCode;
  status: PaymentStatusValue;
  paidAt: string | null;
}

export class AdminResource {
  constructor(private readonly http: HttpClient) {}

  dashboardStats(params: DateRangeParams = {}): Promise<DashboardStats> {
    return this.http.get<DashboardStats>('/admin/dashboard/stats', { params });
  }

  bookingsSeries(params: DateRangeParams = {}): Promise<{ day: string; bookings: number }[]> {
    return this.http.get<{ day: string; bookings: number }[]>('/admin/dashboard/bookings-series', {
      params,
    });
  }

  statusBreakdown(params: DateRangeParams = {}): Promise<{ name: string; value: number }[]> {
    return this.http.get<{ name: string; value: number }[]>('/admin/dashboard/status-breakdown', {
      params,
    });
  }

  topTours(params: DateRangeParams = {}): Promise<TopTour[]> {
    return this.http.get<TopTour[]>('/admin/dashboard/top-tours', { params });
  }

  recentBookings(params: DateRangeParams = {}): Promise<
    {
      reference: string;
      customer: string;
      amountMinor: number;
      status: BookingStatusValue;
      bookedAt: string;
    }[]
  > {
    return this.http.get('/admin/dashboard/recent-bookings', { params });
  }

  tourStats(): Promise<{ total: number; published: number; draft: number; locations: number }> {
    return this.http.get('/admin/tours/stats');
  }

  tours(
    params: DateRangeParams & {
      search?: string;
      status?: string;
      location?: string;
      minPriceMinor?: number;
      maxPriceMinor?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<Paginated<AdminTour>> {
    return this.http.getPaginated<AdminTour>('/admin/tours', { params });
  }

  bookingStats(): Promise<{
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    revenueMinor: number;
  }> {
    return this.http.get('/admin/bookings/stats');
  }

  bookings(
    params: DateRangeParams & {
      search?: string;
      status?: string;
      paymentStatus?: string;
      tourId?: string;
      minAmountMinor?: number;
      maxAmountMinor?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<Paginated<AdminBooking>> {
    return this.http.getPaginated<AdminBooking>('/admin/bookings', { params });
  }

  booking(reference: string): Promise<AdminBookingDetail> {
    return this.http.get<AdminBookingDetail>(`/admin/bookings/${reference}`);
  }

  blogStats(): Promise<{ total: number; published: number; draft: number }> {
    return this.http.get('/admin/blogs/stats');
  }

  blogs(
    params: DateRangeParams & {
      search?: string;
      status?: string;
      category?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<Paginated<AdminBlog>> {
    return this.http.getPaginated<AdminBlog>('/admin/blogs', { params });
  }

  paymentStats(): Promise<{
    collectedMinor: number;
    pendingMinor: number;
    refundedMinor: number;
    failed: number;
  }> {
    return this.http.get('/admin/payments/stats');
  }

  payments(
    params: DateRangeParams & {
      search?: string;
      status?: string;
      method?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<Paginated<AdminPayment>> {
    return this.http.getPaginated<AdminPayment>('/admin/payments', { params });
  }

  // --- writes ----------------------------------------------------------------

  createTour(payload: SaveTourPayload): Promise<{ id: string; slug: string }> {
    return this.http.post<{ id: string; slug: string }>('/admin/tours', payload);
  }

  updateTour(id: string, payload: SaveTourPayload): Promise<{ id: string; slug: string }> {
    return this.http.patch<{ id: string; slug: string }>(`/admin/tours/${id}`, payload);
  }

  deleteTour(id: string): Promise<{ message: string }> {
    return this.http.delete<{ message: string }>(`/admin/tours/${id}`);
  }

  createBlog(payload: SaveBlogPayload): Promise<{ id: string; slug: string }> {
    return this.http.post<{ id: string; slug: string }>('/admin/blogs', payload);
  }

  updateBlog(id: string, payload: SaveBlogPayload): Promise<{ id: string; slug: string }> {
    return this.http.patch<{ id: string; slug: string }>(`/admin/blogs/${id}`, payload);
  }

  deleteBlog(id: string): Promise<{ message: string }> {
    return this.http.delete<{ message: string }>(`/admin/blogs/${id}`);
  }

  updateBooking(
    reference: string,
    payload: { fullName?: string; email?: string; status?: BookingStatusValue },
  ): Promise<{ message: string }> {
    return this.http.patch<{ message: string }>(`/admin/bookings/${reference}`, payload);
  }

  cancelBooking(reference: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(`/admin/bookings/${reference}/cancel`);
  }

  addBookingNote(reference: string, body: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(`/admin/bookings/${reference}/notes`, { body });
  }

  /** Replaces the whole gallery; the first URL becomes the cover. */
  setTourImages(id: string, urls: string[]): Promise<{ message: string }> {
    return this.http.put<{ message: string }>(`/admin/tours/${id}/images`, { urls });
  }

  tour(id: string): Promise<AdminTourDetail> {
    return this.http.get<AdminTourDetail>(`/admin/tours/${id}`);
  }

  /** The invoice PDF, for printing. */
  invoicePdf(reference: string): Promise<Blob> {
    return this.http.download(`/admin/bookings/${reference}/invoice`);
  }

  /** Every e-ticket in the booking, one page each. */
  ticketsPdf(reference: string): Promise<Blob> {
    return this.http.download(`/admin/bookings/${reference}/tickets`);
  }

  /** The bookings table as CSV, narrowed by the same filters. */
  exportBookings(
    params: DateRangeParams & {
      search?: string;
      status?: string;
      paymentStatus?: string;
      tourId?: string;
      minAmountMinor?: number;
      maxAmountMinor?: number;
    } = {},
  ): Promise<Blob> {
    return this.http.download('/admin/bookings/export', { params });
  }

  /**
   * Corrects a manually-recorded payment — cash, bank transfer, a card taken by
   * phone. The API rejects this for anything Stripe captured; that record is the
   * processor's, and `payment.isManual` says which kind you are looking at.
   */
  updatePayment(
    paymentId: string,
    payload: {
      method?: string;
      transactionId?: string;
      amountMinor?: number;
      paidAt?: string;
    },
  ): Promise<{ message: string }> {
    return this.http.patch<{ message: string }>(`/admin/payments/${paymentId}`, payload);
  }

  /** Adds a departure to an existing booking, claiming its seats. */
  addBookingItem(
    reference: string,
    payload: { slotId: string; quantity: number; holders?: TicketHolderInput[] },
  ): Promise<BookingTotals & { id: string }> {
    return this.http.post<BookingTotals & { id: string }>(
      `/admin/bookings/${reference}/items`,
      payload,
    );
  }

  updateBookingItem(
    reference: string,
    itemId: string,
    payload: { quantity: number; holders?: TicketHolderInput[] },
  ): Promise<BookingTotals> {
    return this.http.patch<BookingTotals>(`/admin/bookings/${reference}/items/${itemId}`, payload);
  }

  removeBookingItem(reference: string, itemId: string): Promise<BookingTotals> {
    return this.http.delete<BookingTotals>(`/admin/bookings/${reference}/items/${itemId}`);
  }

  /**
   * Refunds through Stripe. Omit the amount to refund everything still
   * refundable; the local record is written by the resulting webhook, so a
   * refund made here and one made in the Stripe dashboard agree.
   */
  refundPayment(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(`/admin/payments/${paymentId}/refund`, {
      amountMinor,
    });
  }

  sendConfirmation(reference: string): Promise<{ sentTo: string }> {
    return this.http.post<{ sentTo: string }>(`/admin/bookings/${reference}/send-confirmation`);
  }

  blog(id: string): Promise<AdminBlogDetail> {
    return this.http.get<AdminBlogDetail>(`/admin/blogs/${id}`);
  }

  blogCategories(): Promise<{ id: string; name: string }[]> {
    return this.http.get<{ id: string; name: string }[]>('/admin/blog-categories');
  }

  locations(): Promise<AdminLocation[]> {
    return this.http.get<AdminLocation[]>('/admin/locations');
  }

  tourSlots(id: string, date?: string): Promise<AdminSlot[]> {
    return this.http.get<AdminSlot[]>(`/admin/tours/${id}/slots`, { params: { date } });
  }

  createSlot(tourId: string, payload: SaveSlotPayload): Promise<{ id: string }> {
    return this.http.post<{ id: string }>(`/admin/tours/${tourId}/slots`, payload);
  }

  updateSlot(slotId: string, payload: SaveSlotPayload): Promise<{ message: string }> {
    return this.http.patch<{ message: string }>(`/admin/slots/${slotId}`, payload);
  }

  deleteSlot(slotId: string): Promise<{ message: string }> {
    return this.http.delete<{ message: string }>(`/admin/slots/${slotId}`);
  }

  createLocation(payload: SaveLocationPayload): Promise<{ id: string; name: string }> {
    return this.http.post<{ id: string; name: string }>('/admin/locations', payload);
  }

  /**
   * Multipart, so this bypasses the JSON helpers. The browser sets the
   * boundary itself — setting Content-Type by hand would break the parse.
   */
  uploadImage(file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<UploadResult, FormData>('/admin/uploads', form);
  }
}

/** One post in the shape the admin editor edits. */
export interface AdminBlogDetail {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: 'PUBLISHED' | 'DRAFT';
  coverImage: string | null;
  categories: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketHolderInput {
  firstName: string;
  lastName: string;
}

/** What a booking owes after an edit, recomputed from its items. */
export interface BookingTotals {
  subtotal: number;
  bookingFee: number;
  total: number;
}

export interface AdminLocation {
  id: string;
  name: string;
  country: string;
}

/** One tour in the shape the admin editor edits. */
export interface AdminTourDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationHours: number;
  type: SaveTourPayload['type'];
  location: string;
  priceUsdMinor: number;
  priceEurMinor: number;
  maxTicketsPerTour: number;
  highlights: string[];
  included: string[];
  goodToKnow: string[];
  gallery: string[];
  plans: { title: string; description: string }[];
  meetingPointTitle: string | null;
  meetingPointAddress: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSlot {
  id: string;
  date: string;
  time: string;
  capacity: number;
  booked: number;
}

export interface SaveSlotPayload {
  date: string;
  time: string;
  capacity: number;
}

export interface SaveLocationPayload {
  name: string;
  country: string;
}

export interface UploadResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SaveTourPayload {
  title: string;
  slug?: string;
  description: string;
  durationHours: number;
  type: 'WALKING' | 'BUS' | 'MUSEUM' | 'DAY_TRIP' | 'FOOD' | 'PRIVATE';
  location: string;
  priceEurMinor: number;
  priceUsdMinor: number;
  maxTicketsPerTour: number;
  highlights: string[];
  included: string[];
  goodToKnow: string[];
  plans: { title: string; description: string }[];
  meetingPointTitle?: string;
  meetingPointAddress?: string;
  published: boolean;
}

export interface SaveBlogPayload {
  title: string;
  slug?: string;
  content: string;
  status: 'PUBLISHED' | 'DRAFT';
  coverImage?: string;
  categories: string[];
  metaTitle?: string;
  metaDescription?: string;
  keywords: string[];
}

// --- traveller bookings ------------------------------------------------------

export interface TravellerBookingTour {
  title: string;
  date: string;
  time: string;
  location: string;
  travellers: number;
  unitPriceMinor: number;
  amountMinor: number;
  meetingPoint: string | null;
  meetingPointAddress: string | null;
}

export interface TravellerBooking {
  reference: string;
  bookedAt: string;
  status: BookingStatusValue;
  paymentStatus: PaymentStatusValue;
  subtotalMinor: number;
  bookingFeeMinor: number;
  totalMinor: number;
  currency: CurrencyCode;
  tours: TravellerBookingTour[];
}

export class BookingsResource {
  constructor(private readonly http: HttpClient) {}

  /** Always resolves — the response never reveals whether the address exists. */
  requestLink(email: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/bookings/lookup', { email });
  }

  byToken(token: string): Promise<TravellerBooking[]> {
    return this.http.get<TravellerBooking[]>(`/bookings/lookup/${encodeURIComponent(token)}`);
  }

  /**
   * Your own e-tickets. The same signed token that revealed the booking is
   * required again — a reference is printed on emails and is not a secret.
   */
  ticketsPdf(reference: string, token: string): Promise<Blob> {
    return this.http.download(`/bookings/${reference}/tickets`, { params: { token } });
  }

  invoicePdf(reference: string, token: string): Promise<Blob> {
    return this.http.download(`/bookings/${reference}/invoice`, { params: { token } });
  }
}
