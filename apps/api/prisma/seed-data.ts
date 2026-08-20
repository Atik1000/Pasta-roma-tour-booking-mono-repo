/**
 * Seed content.
 *
 * Tour titles, prices, durations and locations are taken from the UI designs so
 * the seeded database renders the screens exactly as drawn.
 */

export interface SeedTour {
  title: string;
  slug: string;
  description: string;
  durationHours: number;
  type: 'WALKING' | 'BUS' | 'MUSEUM' | 'DAY_TRIP' | 'FOOD' | 'PRIVATE';
  location: string;
  priceEur: number;
  priceUsd: number;
  status: 'PUBLISHED' | 'DRAFT';
  isBestseller?: boolean;
  maxTickets: number;
  meetingPointTitle: string;
  meetingPointAddress: string;
  images: string[];
  highlights: string[];
  included: string[];
  goodToKnow: string[];
  plans: { title: string; description: string }[];
}

export const LOCATIONS = [
  { name: 'Rome, Italy', slug: 'rome-italy', country: 'Italy' },
  { name: 'Vatican City', slug: 'vatican-city', country: 'Vatican City' },
  { name: 'Florence, Italy', slug: 'florence-italy', country: 'Italy' },
  { name: 'Venice, Italy', slug: 'venice-italy', country: 'Italy' },
  { name: 'Tuscany, Italy', slug: 'tuscany-italy', country: 'Italy' },
  { name: 'Naples, Italy', slug: 'naples-italy', country: 'Italy' },
] as const;

export const BLOG_CATEGORIES = [
  { name: 'Travel Guide', slug: 'travel-guide' },
  { name: 'Attractions', slug: 'attractions' },
  { name: 'Food & Drink', slug: 'food-and-drink' },
  { name: 'Local Tips', slug: 'local-tips' },
  { name: 'News & Updates', slug: 'news-and-updates' },
] as const;

/** The eight tours that appear by name in the designs, plus catalogue filler. */
export const TOURS: SeedTour[] = [
  {
    title: 'Colosseum Underground Tour',
    slug: 'colosseum-underground-tour',
    description:
      'Step into the Colosseum like never before. This guided tour takes you beneath the arena floor to explore the underground chambers, walk across the arena floor, and learn the stories of gladiators and ancient spectacles from an expert local guide.',
    durationHours: 2.5,
    type: 'WALKING',
    location: 'rome-italy',
    priceEur: 5900,
    priceUsd: 9900,
    status: 'PUBLISHED',
    isBestseller: true,
    maxTickets: 10,
    meetingPointTitle: 'Colosseo Metro Station',
    meetingPointAddress: 'Via dei Fori Imperiali, 1, 00186 Roma RM, Italy',
    images: ['colosseum-arena', 'colosseum-underground', 'colosseum-sunset', 'colosseum-arches'],
    highlights: [
      'Access the Colosseum Underground, rarely seen by visitors',
      'Walk on the arena floor and stand where gladiators once fought',
      'Learn fascinating stories from a professional local guide',
      'Enjoy priority entrance and skip the long ticket lines',
    ],
    included: [
      'Priority entrance ticket',
      'Professional English-speaking guide',
      'Access to Colosseum Underground',
      'Access to Arena Floor',
      'All taxes and booking fees',
    ],
    goodToKnow: [
      'Wear comfortable shoes; there is a lot of walking',
      'Large bags and luggage are not allowed',
      'The tour operates rain or shine',
      'Please arrive 15 minutes before the start time',
    ],
    plans: [
      {
        title: 'Meet Your Guide',
        description: 'Meet your guide near the Colosseo Metro station and start your journey.',
      },
      {
        title: 'Colosseum Underground',
        description: 'Descend into the underground chambers and explore the hidden world.',
      },
      {
        title: 'Arena Floor Access',
        description: 'Walk onto the arena floor and imagine the roar of the ancient crowds.',
      },
      {
        title: 'Stories of Gladiators',
        description: 'Hear captivating stories about gladiators, emperors, and epic battles.',
      },
    ],
  },
  {
    title: 'Vatican Museums & Sistine Chapel',
    slug: 'vatican-museums-sistine-chapel',
    description:
      'Skip the lines and discover the masterpieces of the Vatican Museums, ending in the Sistine Chapel beneath Michelangelo’s ceiling.',
    durationHours: 3,
    type: 'MUSEUM',
    location: 'vatican-city',
    priceEur: 6900,
    priceUsd: 8900,
    status: 'PUBLISHED',
    maxTickets: 12,
    meetingPointTitle: 'Vatican Museums Entrance',
    meetingPointAddress: 'Viale Vaticano, 00165 Roma RM, Italy',
    images: ['vatican-dome', 'vatican-gallery', 'sistine-chapel'],
    highlights: [
      'Skip-the-line entrance to the Vatican Museums',
      'See the Sistine Chapel and Michelangelo’s ceiling',
      'Walk the Gallery of Maps and the Raphael Rooms',
    ],
    included: [
      'Skip-the-line entrance ticket',
      'Licensed art-historian guide',
      'Headsets for groups',
      'All taxes and fees',
    ],
    goodToKnow: [
      'Shoulders and knees must be covered',
      'Photography is not permitted in the Sistine Chapel',
      'Not suitable for large luggage',
    ],
    plans: [
      { title: 'Meet & Greet', description: 'Meet your guide outside the museum entrance.' },
      { title: 'Gallery of Maps', description: 'Walk the frescoed corridor of 16th-century maps.' },
      { title: 'Raphael Rooms', description: 'Explore the papal apartments painted by Raphael.' },
      { title: 'Sistine Chapel', description: 'Finish beneath Michelangelo’s ceiling.' },
    ],
  },
  {
    title: 'Rome Hop-On Hop-Off Bus Tour',
    slug: 'rome-hop-on-hop-off-bus-tour',
    description:
      'Discover Rome at your own pace with unlimited hop-on hop-off access across the city’s most iconic stops.',
    durationHours: 24,
    type: 'BUS',
    location: 'rome-italy',
    priceEur: 3500,
    priceUsd: 3500,
    status: 'PUBLISHED',
    maxTickets: 20,
    meetingPointTitle: 'Termini Station Stop',
    meetingPointAddress: 'Piazza dei Cinquecento, 00185 Roma RM, Italy',
    images: ['rome-bus', 'rome-street', 'rome-forum'],
    highlights: [
      'Unlimited travel on all routes',
      'Eight stops at Rome’s major landmarks',
      'Audio commentary in eight languages',
    ],
    included: ['24-hour travel pass', 'Onboard audio guide', 'City map'],
    goodToKnow: [
      'Buses run every 15–20 minutes',
      'The open top deck is weather dependent',
      'Your pass activates on first boarding',
    ],
    plans: [
      { title: 'Board at Termini', description: 'Collect your pass and board at any stop.' },
      { title: 'Explore Freely', description: 'Hop off wherever you like and rejoin later.' },
      { title: 'Evening Loop', description: 'Catch the final loop for sunset views.' },
    ],
  },
  {
    title: 'Florence Day Trip from Rome',
    slug: 'florence-day-trip-from-rome',
    description:
      'A full-day guided trip to Florence with high-speed train tickets and an expert guide through the Renaissance city.',
    durationHours: 10,
    type: 'DAY_TRIP',
    location: 'florence-italy',
    priceEur: 8900,
    priceUsd: 12900,
    status: 'PUBLISHED',
    maxTickets: 8,
    meetingPointTitle: 'Roma Termini — Platform 1',
    meetingPointAddress: 'Piazza dei Cinquecento, 00185 Roma RM, Italy',
    images: ['florence-duomo', 'florence-bridge', 'florence-skyline'],
    highlights: [
      'Round-trip high-speed train from Rome',
      'Guided walk through the historic centre',
      'See the Duomo, Ponte Vecchio and Piazza della Signoria',
    ],
    included: ['Return train tickets', 'Professional guide', 'Walking tour of Florence'],
    goodToKnow: [
      'Departure is early — arrive 20 minutes before',
      'Lunch is not included',
      'Bring a valid ID for the train',
    ],
    plans: [
      { title: 'Departure', description: 'Meet at Roma Termini and board the high-speed train.' },
      { title: 'Historic Centre', description: 'Guided walk past the Duomo and Baptistery.' },
      { title: 'Free Time', description: 'Explore, shop or eat at your own pace.' },
      { title: 'Return', description: 'Regroup and take the evening train back to Rome.' },
    ],
  },
  {
    title: 'Rome Evening Walking Tour',
    slug: 'rome-evening-walking-tour',
    description:
      'Stroll through Rome’s illuminated landmarks and hidden gems as the city glows after dark.',
    durationHours: 2,
    type: 'WALKING',
    location: 'rome-italy',
    priceEur: 3500,
    priceUsd: 4500,
    status: 'PUBLISHED',
    maxTickets: 15,
    meetingPointTitle: 'Piazza Navona Fountain',
    meetingPointAddress: 'Piazza Navona, 00186 Roma RM, Italy',
    images: ['rome-evening', 'trevi-night', 'pantheon-night'],
    highlights: [
      'See the Trevi Fountain and Pantheon lit at night',
      'Discover quiet piazzas away from the crowds',
      'Small group with a local storyteller',
    ],
    included: ['Local guide', 'Small-group experience'],
    goodToKnow: ['Comfortable shoes recommended', 'Tour runs in light rain'],
    plans: [
      { title: 'Piazza Navona', description: 'Begin at Bernini’s fountain of the Four Rivers.' },
      { title: 'Pantheon', description: 'Admire the ancient dome by night.' },
      { title: 'Trevi Fountain', description: 'Toss a coin and make a wish.' },
    ],
  },
  {
    title: 'Trastevere Food Tour',
    slug: 'trastevere-food-tour',
    description:
      'Taste authentic Italian food and local wines in the heart of Trastevere with a local food guide.',
    durationHours: 3,
    type: 'FOOD',
    location: 'rome-italy',
    priceEur: 6500,
    priceUsd: 7900,
    status: 'PUBLISHED',
    maxTickets: 10,
    meetingPointTitle: 'Piazza Trilussa',
    meetingPointAddress: 'Piazza Trilussa, 00153 Roma RM, Italy',
    images: ['trastevere-street', 'pasta-dish', 'wine-tasting'],
    highlights: [
      'Six tastings across family-run establishments',
      'Local wines paired with each stop',
      'Learn the history of Roman cuisine',
    ],
    included: ['All food tastings', 'Wine pairings', 'Local food guide'],
    goodToKnow: [
      'Let us know about dietary requirements in advance',
      'Come hungry — portions are generous',
    ],
    plans: [
      { title: 'Meet in Trastevere', description: 'Gather at Piazza Trilussa with your guide.' },
      { title: 'Salumi & Cheese', description: 'Taste cured meats and pecorino romano.' },
      { title: 'Roman Pasta', description: 'Try cacio e pepe made the traditional way.' },
      { title: 'Dolci', description: 'Finish with tiramisù and an espresso.' },
    ],
  },
  {
    title: 'Venice Gondola Ride',
    slug: 'venice-gondola-ride',
    description: 'A romantic gondola ride through Venice’s historic canals.',
    durationHours: 0.5,
    type: 'PRIVATE',
    location: 'venice-italy',
    priceEur: 6500,
    priceUsd: 6500,
    status: 'DRAFT',
    maxTickets: 6,
    meetingPointTitle: 'San Marco Gondola Station',
    meetingPointAddress: 'Piazza San Marco, 30124 Venezia VE, Italy',
    images: ['venice-canal', 'venice-gondola'],
    highlights: ['Glide along the Grand Canal', 'Private gondola for your group'],
    included: ['30-minute gondola ride', 'Gondolier'],
    goodToKnow: ['Weather dependent', 'Maximum six passengers per gondola'],
    plans: [
      { title: 'Boarding', description: 'Meet your gondolier at the station.' },
      { title: 'Canal Cruise', description: 'Drift past palazzi and under stone bridges.' },
    ],
  },
  {
    title: 'Tuscany Wine Tour',
    slug: 'tuscany-wine-tour',
    description: 'Taste the best wines in Tuscany with visits to local family wineries.',
    durationHours: 8,
    type: 'DAY_TRIP',
    location: 'tuscany-italy',
    priceEur: 14900,
    priceUsd: 14900,
    status: 'DRAFT',
    maxTickets: 8,
    meetingPointTitle: 'Florence Santa Maria Novella',
    meetingPointAddress: 'Piazza della Stazione, 50123 Firenze FI, Italy',
    images: ['tuscany-vineyard', 'tuscany-hills'],
    highlights: ['Two winery visits', 'Chianti tastings', 'Tuscan lunch included'],
    included: ['Transport', 'Wine tastings', 'Lunch'],
    goodToKnow: ['Minimum age 18 for tastings', 'Long day — dress comfortably'],
    plans: [
      { title: 'Departure', description: 'Leave Florence for the Chianti hills.' },
      { title: 'First Winery', description: 'Tour the cellars and taste four wines.' },
      { title: 'Tuscan Lunch', description: 'Enjoy a long lunch with local produce.' },
      { title: 'Second Winery', description: 'Finish with a reserve tasting.' },
    ],
  },
];

/** Titles used to fill the catalogue out to 24 tours. */
export const FILLER_TOURS: {
  title: string;
  location: string;
  type: SeedTour['type'];
  hours: number;
  eur: number;
}[] = [
  {
    title: 'Roman Forum & Palatine Hill Tour',
    location: 'rome-italy',
    type: 'WALKING',
    hours: 2.5,
    eur: 4900,
  },
  {
    title: 'Borghese Gallery Private Tour',
    location: 'rome-italy',
    type: 'PRIVATE',
    hours: 2,
    eur: 9500,
  },
  {
    title: 'Rome Ancient City Walking Tour',
    location: 'rome-italy',
    type: 'WALKING',
    hours: 3,
    eur: 4500,
  },
  { title: 'Catacombs of Rome Tour', location: 'rome-italy', type: 'WALKING', hours: 2, eur: 4200 },
  {
    title: "St Peter's Basilica & Dome Climb",
    location: 'vatican-city',
    type: 'MUSEUM',
    hours: 2,
    eur: 5500,
  },
  {
    title: 'Vatican Gardens Guided Walk',
    location: 'vatican-city',
    type: 'WALKING',
    hours: 2,
    eur: 6200,
  },
  {
    title: 'Pompeii Day Trip from Rome',
    location: 'naples-italy',
    type: 'DAY_TRIP',
    hours: 12,
    eur: 13900,
  },
  { title: 'Naples Street Food Walk', location: 'naples-italy', type: 'FOOD', hours: 3, eur: 5900 },
  {
    title: 'Uffizi Gallery Skip-the-Line',
    location: 'florence-italy',
    type: 'MUSEUM',
    hours: 2.5,
    eur: 6900,
  },
  {
    title: 'Accademia & David Tour',
    location: 'florence-italy',
    type: 'MUSEUM',
    hours: 1.5,
    eur: 5900,
  },
  {
    title: 'Florence Sunset Wine Walk',
    location: 'florence-italy',
    type: 'FOOD',
    hours: 2.5,
    eur: 6500,
  },
  {
    title: 'Venice Doge’s Palace Tour',
    location: 'venice-italy',
    type: 'MUSEUM',
    hours: 2,
    eur: 6900,
  },
  {
    title: 'Murano & Burano Boat Trip',
    location: 'venice-italy',
    type: 'DAY_TRIP',
    hours: 6,
    eur: 8500,
  },
  {
    title: 'Siena & San Gimignano Day Trip',
    location: 'tuscany-italy',
    type: 'DAY_TRIP',
    hours: 11,
    eur: 12900,
  },
  { title: 'Tuscan Cooking Class', location: 'tuscany-italy', type: 'FOOD', hours: 4, eur: 9900 },
  {
    title: 'Amalfi Coast Private Driver',
    location: 'naples-italy',
    type: 'PRIVATE',
    hours: 9,
    eur: 24900,
  },
];

export const BLOG_POSTS: {
  title: string;
  slug: string;
  categories: string[];
  status: 'PUBLISHED' | 'DRAFT';
  content: string;
}[] = [
  {
    title: '10 Must-See Attractions in Rome',
    slug: '10-must-see-attractions-in-rome',
    categories: ['travel-guide', 'attractions', 'local-tips'],
    status: 'PUBLISHED',
    content: `Rome is a city that blends history, art, and culture at every corner. Whether it's your first visit or the tenth, these must-see attractions will make your trip unforgettable.

## 1. The Colosseum

Step into the heart of ancient Rome and explore one of the world's most iconic landmarks. A masterpiece of engineering and history.

## 2. Vatican City & St. Peter's Basilica

Home to the Pope and one of the most magnificent religious sites in the world, Vatican City offers breathtaking art and spiritual significance.

## 3. Trevi Fountain

Make a wish and toss a coin into the Trevi Fountain — a timeless tradition in the heart of Rome.`,
  },
  {
    title: 'A Perfect 3-Day Itinerary for Rome',
    slug: 'a-perfect-3-day-itinerary-for-rome',
    categories: ['travel-guide'],
    status: 'PUBLISHED',
    content: `Three days is enough to see the essentials of Rome without rushing. Here is how to make the most of your trip.

## Day One — Ancient Rome

Start at the Colosseum, continue through the Roman Forum, and end on Palatine Hill.

## Day Two — Vatican City

Dedicate a full morning to the Vatican Museums and the Sistine Chapel.

## Day Three — Piazzas and Food

Wander from Piazza Navona to the Pantheon, then eat your way through Trastevere.`,
  },
  {
    title: 'Vatican Museums: Tips for a Smooth Visit',
    slug: 'vatican-museums-tips-for-a-smooth-visit',
    categories: ['attractions', 'local-tips'],
    status: 'PUBLISHED',
    content: `Plan ahead and enjoy a stress-free experience at the Vatican Museums.

## Book in advance

Skip-the-line tickets save hours in peak season.

## Dress appropriately

Shoulders and knees must be covered to enter the Sistine Chapel.

## Go early or late

The first and last entry slots are noticeably quieter.`,
  },
  {
    title: 'Where to Eat the Best Pasta in Rome',
    slug: 'where-to-eat-the-best-pasta-in-rome',
    categories: ['food-and-drink', 'local-tips'],
    status: 'PUBLISHED',
    content: `Our favourite local spots for authentic Roman pasta you'll love.

## Cacio e Pepe

Simple, sharp and impossible to fake. Trastevere does it best.

## Carbonara

No cream, ever. Guanciale, egg, pecorino and pepper.

## Amatriciana

Look for a trattoria that still uses bucatini.`,
  },
  {
    title: 'Rome Travel Tips: What You Should Know Before You Go',
    slug: 'rome-travel-tips-what-you-should-know-before-you-go',
    categories: ['local-tips', 'travel-guide'],
    status: 'PUBLISHED',
    content: `Helpful tips to make your Rome adventure smooth and memorable.

## Getting around

The historic centre is walkable; the metro covers the rest.

## Water

Drink from the nasoni — Rome's public fountains are safe and free.

## Timing

Most churches close for a few hours after midday.`,
  },
  {
    title: 'Best Day Trips from Rome',
    slug: 'best-day-trips-from-rome',
    categories: ['travel-guide'],
    status: 'PUBLISHED',
    content: `Explore the best destinations you can visit on a day trip from Rome.

## Florence

Ninety minutes by high-speed train, and worth every minute.

## Pompeii

A preserved Roman city in the shadow of Vesuvius.

## Tivoli

Renaissance gardens and Roman villas, an hour from the city.`,
  },
];
