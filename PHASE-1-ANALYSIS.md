# Pasta Roma Tour — Phase 1: UI Analysis, Domain Model & Roadmap

> Source of truth: the 17 UI images in this folder. Blue hand-drawn marks are **removal / change instructions** and are treated as binding.

---

## 0. What this product actually is

The designs are **not** a generic CRM. This is a **tour & ticket e-commerce and booking platform** for Rome/Italy experiences, with:

- a **public website** (browse tours → check availability → cart → checkout → find bookings by email → blog), and
- an **internal admin panel** with exactly five areas: **Dashboard, Tours, Bookings, Payments, Blogs**.

The generic modules in the brief (Products catalog, Subscriptions, Invoices, Roles & Permissions screens, Media Library, Audit Log screens, Support desk) have **no designs**. They are _not_ dropped silently — see §7 Scope Decisions.

---

## 1. Screen inventory (17 images → 16 unique screens)

### Public website — `apps/web`

| #   | Screen                                            | File                                           | Route                        |
| --- | ------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 1   | Home / Landing                                    | `Landing page/1.png`                           | `/`                          |
| 2   | Tours listing (search, filter, sort, paginate)    | `Tours/tours.png`                              | `/tours`                     |
| 3   | Tour details                                      | `Tours/tour details.png`                       | `/tours/[slug]`              |
| 4   | Check Availability (date → time slot → travelers) | `Check Ticket availability/1.png`              | `/tours/[slug]/availability` |
| 5   | Cart                                              | `Cart/cart.png`                                | `/cart`                      |
| 6   | Cart Checkout (billing + per-ticket holder names) | `Cart checkout_ Booking Checkout/checkout.png` | `/checkout`                  |
| 7   | My Bookings (email lookup)                        | `My Bookings/My_bookings.png` + clean variant  | `/my-bookings`               |
| 8   | Blog listing (sidebar: search, categories)        | `Blogs/List of Blogs.png`                      | `/blog`                      |
| 9   | Blog article                                      | `Blogs/Read blog.png`                          | `/blog/[slug]`               |

### Admin panel — `apps/admin`

| #   | Screen                                               | File                                                 | Route                       |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| 10  | Dashboard (KPIs, charts, top tours, recent bookings) | `Admin Panel/dashboard_admin_panel.png`              | `/dashboard`                |
| 11  | Tours list (KPIs, filters, table, row actions)       | `Admin Panel/Tours/List_of_tours.png`                | `/tours`                    |
| 12  | Tour create/edit (the single most complex screen)    | `Admin Panel/Tours/Tour_details_update_creation.png` | `/tours/[id]`, `/tours/new` |
| 13  | Bookings list (KPIs, 3 filters, table)               | `Admin Panel/Bookings/list_of_bookings.png`          | `/bookings`                 |
| 14  | Booking details (fully editable)                     | `Admin Panel/Bookings/booking_details.png`           | `/bookings/[id]`            |
| 15  | Blogs list                                           | `Admin Panel/Blogs/List_of_blogs.png`                | `/blogs`                    |
| 16  | Blog create/edit (+ SEO panel)                       | `Admin Panel/Blogs/blog_creation_update_details.png` | `/blogs/[id]`, `/blogs/new` |

**Designed but not drawn** (referenced by the UI, must exist): admin **Payments** (sidebar item), admin **Login**, public **Login/Register**, public **Add New Location** modal (button on Tours list), tour **Gallery lightbox**, footer legal pages, Locations / Products nav targets.

---

## 2. Client mark-ups (blue pen) — binding change list

| Screen              | Mark                                               | Interpretation                                                                            |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tour details        | Subtitle line struck                               | Remove the one-line subtitle under the H1                                                 |
| Tour details        | Badge row partly struck                            | Keep Location / Duration / Mobile Ticket / Free Cancellation; drop "Instant Confirmation" |
| Tour details        | "Add to Cart" struck                               | Sidebar has **only** "Check Availability" — cart entry happens on the availability screen |
| Tour details        | "Your Selection" summary X'd                       | Remove the live price-summary block from the tour page sidebar                            |
| Tour details        | "Cancellation Policy" accordion struck             | Remove the accordion                                                                      |
| Check Availability  | "Limited spots" struck (×2)                        | Slot states are only **Available** / **Sold out**                                         |
| Check Availability  | Children row struck                                | **Remove child tickets entirely — adults-only ticketing**                                 |
| My Bookings         | Thumbnails X'd (×3)                                | Booking cards render without tour images                                                  |
| Blog list           | "FEATURED" struck                                  | No featured badge                                                                         |
| Blog list           | Author + read-time struck                          | Cards show date + category only                                                           |
| Blog list / article | "Popular Posts" X'd                                | Remove widget from sidebar                                                                |
| Blog list           | "Subscribe to Newsletter" X'd                      | Remove widget                                                                             |
| Blog article        | "5 min read" struck                                | Remove read-time                                                                          |
| Blog article        | Author bio box X'd                                 | Remove                                                                                    |
| Blog article        | Social share icons struck                          | Remove share row                                                                          |
| Admin dashboard     | % deltas + date sublines struck on all 5 KPI cards | KPI cards show label + value only                                                         |
| Admin dashboard     | "Revenue Overview" chart X'd                       | Remove that card; keep Bookings Overview + Bookings by Status                             |
| Admin tour form     | Rich-text toolbar struck                           | Description = plain multiline textarea                                                    |
| Admin tour form     | "Max Adult Tickets per Booking" annotated _"Tour"_ | Rename → **Max Tickets per Tour**                                                         |
| Admin tour form     | "Created By" X'd                                   | Remove card                                                                               |
| Admin blogs list    | "Blog Categories" button X'd                       | No category-management screen                                                             |
| Admin blogs list    | "Categories" KPI card X'd                          | Remove the 4th stat card                                                                  |
| Admin blog form     | "Excerpt" struck                                   | Remove field                                                                              |
| Admin blog form     | "Publish Date" scribbled out                       | Remove; publish = status toggle, `publishedAt` set server-side                            |

**The adults-only rule propagates**: Cart must drop `Child (6–17 yrs)` rows, Checkout drops `Ticket 2 — Child`, availability drops the children counter and the "under 4 enter free" note, pricing/schema carry a single adult price and a single availability count. This matches the admin tour form, which only ever exposes _Adult Price (USD)_, _Adult Price (EUR)_ and _Adult Tickets Available_.

---

## 3. Design system extracted from the images

- **Palette** — primary `#B5751F`-ish gold/bronze gradient buttons; page background warm cream `#FBF7F1`; cards white with soft warm shadow; ink `#1A1A1A`. Admin sidebar is a near-black navy gradient (`#0B1220 → #14243B`) with a faint Vatican skyline watermark and a gold active pill.
- **Type** — serif display (Playfair-style) for H1/H2 and the wordmark; humanist sans (Inter-style) for UI and body. Numbers in KPI cards are sans, semibold, ~30px.
- **Status colors** — Confirmed/Paid/Published = green; Pending = amber; Cancelled = red; Refunded = blue; Draft = amber-tint.
- **Motifs** — laurel-wreath brackets flanking section titles and page H1s; hero images bleed under a translucent floating navbar; corner-rounded page shell (`rounded-2xl`).
- **Consistency defect** — the **Cart** screen (`Cart/cart.png`) is drawn in a _different_ system: navy/blue accents, a different navbar (`Tours · Attractions · Blog · About Us · Contact · My Account`), different typography. Every other screen uses `Search Tours · Locations · Products · Blogs · Currency · Cart · Login`. **Recommendation: keep the cart's layout and content exactly, restyle it into the gold/cream system with the standard navbar.** (Decision needed — see §8.)

### Shared component catalog (`packages/ui`)

`Button` (solid gold / outline gold / ghost / destructive) · `Input` `Textarea` `Select` `Combobox` `Checkbox` `RadioCard` `Switch` · `QuantityStepper` · `DatePicker` · `DateStrip` (7-day availability rail) · `TimeSlotCard` · `Card` `StatCard` `Badge` `StatusPill` `Avatar` `Tabs` `Accordion` `Dropdown` `Dialog` `Drawer` `Sheet` `Tooltip` `Toast` · `DataTable` (sortable, paginated, `rows-per-page`, row actions) · `Pagination` · `Breadcrumb` · `SearchBar` `FilterBar` · `TourCard` `TourCardCompact` `BlogCard` `BookingCard` `CartLineItem` `OrderSummary` `PriceBreakdown` `TicketHolderFields` · `Carousel` (trending tours, related tours) · `Timeline` (tour plan) · `Gallery` + `Lightbox` · `ImageUploader` `SortableList` (drag-reorder highlights/plans) · `AreaChart` `DonutChart` (Recharts) · `Skeleton` `EmptyState` `ErrorState` `Spinner` · `Navbar` `Footer` `Sidebar` `PageHeader` · `ThemeToggle` · `CurrencySwitcher`.

---

## 4. Domain model (Prisma, PostgreSQL, UUID PKs, soft delete, timestamps)

```
User            id, email, passwordHash, name, role(ADMIN|EDITOR), lastLoginAt
RefreshToken    id, userId, tokenHash, expiresAt, revokedAt, userAgent, ip

Location        id, name, country, slug, heroImage            // "Add New Location"
TourType        enum WALKING | BUS | MUSEUM | DAY_TRIP | FOOD | PRIVATE

Tour            id, title, slug, description, durationHours, type, locationId,
                priceAdultUsd, priceAdultEur, maxTicketsPerTour,
                status(DRAFT|PUBLISHED), isBestseller, sortOrder,
                meetingPointTitle, meetingPointAddress
TourImage       id, tourId, url, alt, position, isCover
TourBullet      id, tourId, kind(HIGHLIGHT|INCLUDED|GOOD_TO_KNOW), text, position
TourPlan        id, tourId, position, title, description        // itinerary steps
TourSlot        id, tourId, date, time, capacity, booked        // @@unique([tourId,date,time])

Cart            id, sessionId?, userId?, expiresAt
CartItem        id, cartId, tourId, slotId, date, time, quantity, unitPriceSnapshot

Customer        id, email(unique), fullName, phone?             // guest-first
Booking         id, reference("BK-2024-0521"), customerId, status(PENDING|CONFIRMED|CANCELLED),
                paymentStatus(PENDING|PAID|REFUNDED), currency, subtotal, bookingFee, total,
                bookedAt, cancelledAt, notes[]
BookingItem     id, bookingId, tourId, slotId, date, time, quantity, unitPrice, amount
Ticket          id, bookingItemId, holderFirstName, holderLastName, ticketCode, qrUrl
Payment         id, bookingId, method(CARD|PAYPAL|APPLE_PAY), transactionId,
                amount, currency, paidAt, status
BookingNote     id, bookingId, authorId, body

BlogCategory    id, name, slug          // fixed list, no admin CRUD screen
Blog            id, title, slug, content, coverImage, status, publishedAt,
                metaTitle, metaDescription, keywords[], authorId
BlogOnCategory  blogId, categoryId

Currency/Rate   code, symbol, rateToEur, updatedAt
Setting         key, value(json)
ActivityLog     id, actorId, action, entity, entityId, meta, ip, createdAt
EmailLog        id, to, template, bookingId?, status, sentAt
```

Indexes: `Tour(slug, status, locationId)`, `TourSlot(tourId, date)`, `Booking(reference, customerId, status, bookedAt)`, `Blog(slug, status, publishedAt)`, `Customer(email)`.

---

## 5. API surface (NestJS, REST, Swagger)

**Public** — `GET /tours` (q, location, sort, page) · `GET /tours/:slug` · `GET /tours/:slug/availability?from&to` · `GET /tours/:slug/slots?date` · `GET /locations` · `POST /cart` `GET /cart` `PATCH /cart/items/:id` `DELETE /cart/items/:id` `DELETE /cart` · `POST /checkout/validate` · `POST /checkout` → booking + payment intent · `POST /bookings/lookup {email}` · `GET /bookings/:reference/ticket.pdf` · `GET /blog` `GET /blog/:slug` `GET /blog/categories` · `GET /currencies` · `POST /contact`.

**Auth** — `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `POST /auth/forgot-password` `POST /auth/reset-password` `GET /auth/me`.

**Admin** (JWT + role guard) — `GET /admin/dashboard/stats|bookings-series|status-breakdown|top-tours|recent-bookings` · full CRUD `admin/tours` + `tours/:id/images|bullets|plans|slots` (bulk slot create, reorder endpoints) · `admin/locations` · `GET/PATCH admin/bookings`, `admin/bookings/:id/items`, `/tickets`, `/notes`, `/resend-confirmation`, `/cancel`, `/invoice.pdf`, `GET admin/bookings/export.csv` · `admin/payments` (list, filter, refund, reconcile) · full CRUD `admin/blogs` · `POST /uploads` (S3/local, image validation).

Cross-cutting: global `ValidationPipe` + Zod/class-validator DTOs, `{data, meta}` response envelope, global exception filter, cursor+offset pagination, Helmet, CORS allowlist, Throttler, argon2 hashing, httpOnly refresh cookie, BullMQ queues for confirmation email / ticket PDF / slot-release, cron for expired-cart cleanup and pending-booking expiry.

---

## 6. Repository layout

```
apps/    web (Next 15 public)   admin (Next 15 dashboard)   api (NestJS)
packages/ ui  api-client  types  utils  config(eslint,ts,tailwind)  hooks
docker/  docker-compose.yml  Dockerfile.api  Dockerfile.web  Dockerfile.admin
.github/workflows/ ci.yml (lint · typecheck · test · build)
```

Turborepo + pnpm workspaces, TS strict everywhere, no `any`, ESLint + Prettier + Husky + lint-staged.

---

## 7. Scope decisions on the un-designed CRM modules

| Brief module                                                                                              | Verdict                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Products, Subscriptions, Invoices-as-a-module, Media Library, Support desk, Roles/Permissions **screens** | **Not built as screens** — no design exists and inventing them would contradict the fixed 5-item admin sidebar.                                                                                                           |
| RBAC, refresh tokens, rate limiting, activity/audit logging, invoice **PDF**                              | **Built** — they are backend concerns the designs depend on (Print Invoice button, admin roles).                                                                                                                          |
| Landing pages beyond Home (About, Pricing, FAQ, Contact, Privacy, Terms)                                  | Footer links to Help Center, FAQs, Booking Guide, Cancellation Policy, Payment Methods, Contact, Privacy, Terms, Gift Cards. **Recommendation:** build them as CMS-lite content pages in the established visual language. |

---

## 8. Decisions (locked — 2026-07-28)

1. **Cart restyle → gold/cream.** `Cart/cart.png` keeps its exact layout, columns, order-summary structure and trust badges, but is rendered in the primary gold/cream system with the standard navbar (`Search Tours · Locations · Products · Blogs · Currency · Cart · Login`). The navy palette and the `Tours/Attractions/Blog/About Us/Contact` navbar are discarded as a design-file inconsistency.
2. **Guest checkout + admin login only.** No customer accounts, no customer registration. Checkout collects billing name/email as a guest; `Customer` rows are keyed by email and created on first booking. My Bookings stays an unauthenticated email lookup (rate-limited, and results are delivered by emailed magic link rather than rendered directly to any visitor who guesses an address). The public navbar **Login** routes to the admin panel; the cart's _My Account_ control is dropped.
3. **Stripe, real integration.** Payment Intents + webhook handler (`payment_intent.succeeded`, `.payment_failed`, `charge.refunded`), idempotency keys, refunds issued from the admin Payments screen. Still implemented behind a `PaymentProvider` port so tests and CI run on a deterministic fake — but Stripe is the production driver. **Needs from you:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (test mode is fine). Until they arrive, the fake driver keeps the flow end-to-end runnable.
4. **Footer pages built in-style during Phase 7.** Help Center, FAQs, Booking Guide, Cancellation Policy, Payment Methods, Contact, Privacy, Terms, Gift Cards — designed in the established laurel/serif language, realistic copy, no dead links.

---

## 9. Roadmap

| Phase  | Deliverable                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **2**  | Monorepo skeleton: Turborepo, pnpm, TS configs, ESLint/Prettier/Husky, Tailwind theme tokens from §3, all three apps booting, CI green |
| **3**  | NestJS architecture: modules, guards, interceptors, filters, Swagger, config, logging, queues                                          |
| **4**  | Prisma schema from §4 + migrations + realistic seed (24 tours, 6 locations, 152 bookings, 24 blogs)                                    |
| **5**  | Auth: JWT + refresh rotation, RBAC, password reset, rate limit, session mgmt                                                           |
| **6**  | Shared packages: `ui` component catalog, `types`, `utils`, `api-client` SDK, `hooks`                                                   |
| **7**  | Public site: screens 1–9, responsive, SEO, RSC where sensible                                                                          |
| **8**  | Admin panel: screens 10–16 + Payments + Login                                                                                          |
| **9**  | Wiring: TanStack Query, optimistic cart/quantity, infinite/paged lists, error+loading+empty states                                     |
| **10** | Tests: Jest unit, supertest e2e on API, Vitest + Testing Library on UI, Playwright happy-path booking flow                             |
| **11** | Docker, docker-compose (postgres, redis, api, web, admin), GitHub Actions, README + install/dev/deploy/env/architecture docs           |
