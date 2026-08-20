/**
 * Content pages linked from the footer.
 *
 * These had no designs, so per the Phase 1 decision they are written in the
 * established visual language with realistic copy. Content lives in one
 * registry so it can move to the CMS later without touching the route.
 */

export interface ContentBlock {
  heading?: string;
  body: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface ContentPage {
  slug: string;
  title: string;
  description: string;
  updatedAt?: string;
  blocks: ContentBlock[];
  faqs?: FaqEntry[];
  /** Renders the contact form beneath the copy. */
  showContactForm?: boolean;
}

export const CONTENT_PAGES: ContentPage[] = [
  {
    slug: 'help',
    title: 'Help Center',
    description: 'Answers to the questions our travellers ask most, and how to reach a human.',
    blocks: [
      {
        heading: 'Before you book',
        body: 'Every tour page lists the duration, meeting point, what is included and what to bring. Tours run on demand — there is no fixed timetable to work around, so anything in the catalogue can be booked.',
      },
      {
        heading: 'After you book',
        body: 'Your confirmation and e-tickets arrive by email within a few minutes. Show the ticket on your phone at the meeting point — there is nothing to print.',
      },
      {
        heading: 'Still stuck?',
        body: 'Write to info@pastaromatour.com or call +39 06 1234 5678 between 9:00 and 19:00 CET, seven days a week. We answer email within one working day.',
      },
    ],
  },
  {
    slug: 'faqs',
    title: 'Frequently Asked Questions',
    description: 'The practical details, in one place.',
    blocks: [],
    faqs: [
      {
        question: 'How do I receive my tickets?',
        answer:
          'By email, within a few minutes of booking. Every ticket is a mobile ticket — show it on your phone at the meeting point.',
      },
      {
        question: 'Can I cancel or change my booking?',
        answer:
          'Yes. Cancel up to 24 hours before the experience starts for a full refund. Inside 24 hours the booking is non-refundable, because your guide and entrance tickets are already committed.',
      },
      {
        question: 'What happens if it rains?',
        answer:
          'Tours run rain or shine unless conditions are unsafe. If we cancel, you are refunded in full or moved to another date, whichever you prefer.',
      },
      {
        question: 'Are children allowed on tours?',
        answer:
          'Children are welcome accompanied by an adult. Tickets are sold per person at the adult rate.',
      },
      {
        question: 'How early should I arrive?',
        answer:
          'Fifteen minutes before the start time. Groups leave on schedule and late arrivals cannot be admitted once a tour has entered a site.',
      },
      {
        question: 'Is the tour wheelchair accessible?',
        answer:
          'It varies by site. Accessibility is noted in "Good to Know" on each tour page — write to us first and we will confirm for your specific date.',
      },
      {
        question: 'What if I booked with the wrong email address?',
        answer:
          'Contact us with your booking reference and we will resend the tickets to the correct address.',
      },
    ],
  },
  {
    slug: 'booking-guide',
    title: 'Booking Guide',
    description: 'How booking works, from search to ticket, in four steps.',
    blocks: [
      {
        heading: '1. Find your tour',
        body: 'Search by keyword or filter by location, then sort by price or duration. Every listing shows the starting price per adult.',
      },
      {
        heading: '2. Choose your party size',
        body: 'Set how many travellers are coming and add the tour to your cart. There is no date to pick — we contact you after booking to agree a time that suits you.',
      },
      {
        heading: '3. Add ticket holders',
        body: 'At checkout you enter a first and last name for each ticket. Names appear on the e-tickets and are checked at the entrance for skip-the-line tours.',
      },
      {
        heading: '4. Pay and go',
        body: 'Pay securely by card or PayPal. Your confirmation and tickets arrive by email straight away — no printing, no queueing.',
      },
    ],
  },
  {
    slug: 'cancellation-policy',
    title: 'Cancellation Policy',
    description: 'Free cancellation up to 24 hours before your experience starts.',
    updatedAt: '2024-05-01',
    blocks: [
      {
        heading: 'Free cancellation window',
        body: 'Cancel more than 24 hours before the start time and you receive a full refund, including the booking fee. No reason is required.',
      },
      {
        heading: 'Inside 24 hours',
        body: 'Cancellations made less than 24 hours before the agreed start time are non-refundable. By that point your guide is scheduled and entrance tickets are issued in your name.',
      },
      {
        heading: 'If we cancel',
        body: 'Occasionally weather, strikes or site closures force us to cancel. You will be offered another date or a full refund — your choice, no fee either way.',
      },
      {
        heading: 'How refunds are issued',
        body: 'Refunds return to the original payment method. Card refunds typically clear within 5–10 working days depending on your bank.',
      },
      {
        heading: 'How to cancel',
        body: 'Use the link in your confirmation email, or write to info@pastaromatour.com with your booking reference.',
      },
    ],
  },
  {
    slug: 'payment-methods',
    title: 'Payment Methods',
    description: 'How you can pay, and how your details are protected.',
    blocks: [
      {
        heading: 'Cards',
        body: 'We accept Visa, Mastercard and American Express. Payments are processed by Stripe; card numbers never touch our servers.',
      },
      {
        heading: 'Wallets',
        body: 'PayPal and Apple Pay are available at checkout on supported devices.',
      },
      {
        heading: 'Currency',
        body: 'Prices are shown in euros by default and can be switched to US dollars using the currency selector. You are always charged in the currency shown at checkout.',
      },
      {
        heading: 'Security',
        body: 'All traffic is encrypted with TLS, and payments are authenticated with 3-D Secure where your bank requires it.',
      },
    ],
  },
  {
    slug: 'gift-cards',
    title: 'Gift Cards',
    description: 'Give an experience in Rome rather than another object.',
    blocks: [
      {
        heading: 'How they work',
        body: 'Gift cards are delivered by email with a unique code and can be spent on any tour on the site. They never expire.',
      },
      {
        heading: 'Choosing an amount',
        body: 'Cards are available from €25 upwards. If the tour costs more than the card, the balance is simply paid at checkout.',
      },
      {
        heading: 'Redeeming',
        body: 'Enter the code at checkout. Any unspent balance stays on the card for a future booking.',
      },
      {
        heading: 'Buying one',
        body: 'Gift card purchasing is coming soon. In the meantime, write to info@pastaromatour.com and we will arrange one for you.',
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    description: 'Questions about a booking, a tour, or something else entirely.',
    showContactForm: true,
    blocks: [
      {
        heading: 'Where to find us',
        body: 'Via del Corso, 123, 00186 Rome, Italy. Our office is open Monday to Sunday, 9:00 to 19:00 CET.',
      },
      {
        heading: 'Response times',
        body: 'Email is answered within one working day. For anything urgent on the day of your tour, please call — that reaches us fastest.',
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'What we collect, why we collect it, and what you can ask us to do about it.',
    updatedAt: '2024-05-01',
    blocks: [
      {
        heading: 'What we collect',
        body: 'To take a booking we need your name, email address and the names of the people travelling. Payment details go directly to our payment processor and are never stored by us.',
      },
      {
        heading: 'Why we collect it',
        body: 'To issue tickets, admit you to the sites you have booked, contact you about changes, and meet our accounting obligations. We do not sell personal data.',
      },
      {
        heading: 'How long we keep it',
        body: 'Booking records are retained for seven years to satisfy Italian tax law. Marketing preferences are kept until you withdraw them.',
      },
      {
        heading: 'Your rights',
        body: 'Under the GDPR you may request a copy of your data, ask for corrections, or ask us to erase it where no legal obligation requires us to keep it. Write to info@pastaromatour.com and we will respond within 30 days.',
      },
      {
        heading: 'Cookies',
        body: 'We use strictly necessary cookies to keep your cart and session working. Analytics cookies are only set with your consent and can be withdrawn at any time.',
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    description: 'The agreement between you and Pasta Roma Tour.',
    updatedAt: '2024-05-01',
    blocks: [
      {
        heading: 'Booking a tour',
        body: 'A contract is formed when we send your booking confirmation. Please check the details on it immediately and tell us about any error.',
      },
      {
        heading: 'Prices and payment',
        body: 'Prices are per person and include taxes and the stated inclusions. A booking fee is added at checkout and shown before you pay. Payment is taken in full at the time of booking unless a tour is marked reserve-now-pay-later.',
      },
      {
        heading: 'Your responsibilities',
        body: 'Arrive at the meeting point on time with valid photo ID where a site requires it, and follow your guide’s instructions and site rules throughout.',
      },
      {
        heading: 'Changes and cancellations',
        body: 'Cancellation is governed by our Cancellation Policy. We may change a tour’s route or order of visits where a site closes or conditions require it; the substance of the experience will be preserved.',
      },
      {
        heading: 'Liability',
        body: 'We are liable for the services we provide. We are not liable for delays or losses caused by events outside our reasonable control, including strikes, extreme weather and site closures.',
      },
      {
        heading: 'Governing law',
        body: 'These terms are governed by Italian law and disputes fall to the courts of Rome.',
      },
    ],
  },
];

export function getContentPage(slug: string): ContentPage | undefined {
  return CONTENT_PAGES.find((page) => page.slug === slug);
}

export function getContentSlugs(): string[] {
  return CONTENT_PAGES.map((page) => page.slug);
}
