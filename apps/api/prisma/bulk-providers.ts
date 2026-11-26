/**
 * BULK TEST PROVIDERS: fills a database with many realistic providers (professional firms through
 * casual piece-work) so search, maps and ranking can be tried at volume. Removable in one go.
 *
 *   npx tsx prisma/bulk-providers.ts                 # create 1000 providers (default)
 *   npx tsx prisma/bulk-providers.ts --count 250     # create 250
 *   npx tsx prisma/bulk-providers.ts --remove        # delete everything this script created
 *
 * Every account it creates uses an @bulk.vicinity.local email (and provider slugs end in "-bulk"),
 * which is how --remove finds them. Accounts get a random password nobody knows, so they cannot be
 * signed into. Phone numbers are in the fake +260 971 0xx xxx range used by the demo data.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { slugify } from '../src/common/util';
import { PLACES } from '../src/locations/places';
import { env } from '../src/config/env';
import { LocalStorageDriver, R2StorageDriver } from '../src/media/storage';

const DOMAIN = '@bulk.vicinity.local';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type PriceType = 'FIXED' | 'STARTING_FROM' | 'RANGE' | 'HOURLY' | 'PER_UNIT' | 'NEGOTIABLE' | 'QUOTE';
/** [title, description, priceType, price?, priceMax?, unit?] */
type L = [string, string, PriceType, number?, number?, string?];
type Tier = 'pro' | 'trade' | 'casual';
interface T {
  cat: string;
  tier: Tier;
  /** Name patterns: {S} surname, {F} first name, {A} area. */
  names: string[];
  tagline: string;
  mode: 'AT_LOCATION' | 'MOBILE' | 'BOTH';
  product?: boolean;
  listings: L[];
  weight?: number;
}

const TEMPLATES: T[] = [
  // ── Professional ────────────────────────────────────────────────
  { cat: 'Legal Services', tier: 'pro', mode: 'AT_LOCATION', names: ['{S} & Associates', '{S} {S2} Legal Practitioners', '{S} Chambers'], tagline: 'Advocates and legal practitioners',
    listings: [['Land and title deed transfers', 'Conveyancing, title searches and change of ownership at Lands.', 'STARTING_FROM', 3500], ['Company registration (PACRA)', 'Name search, registration and statutory documents.', 'FIXED', 2500], ['Legal consultation', 'One-hour consultation on civil, family or employment matters.', 'HOURLY', 800], ['Contract drafting and review', 'Leases, employment and supply contracts.', 'QUOTE']] },
  { cat: 'Accounting', tier: 'pro', mode: 'BOTH', names: ['{S} Chartered Accountants', '{A} Tax & Accounting', '{S} Bookkeeping Services'], tagline: 'ZICA-registered accountants and tax agents',
    listings: [['Monthly bookkeeping', 'Records, reconciliations and monthly management accounts.', 'STARTING_FROM', 1500], ['ZRA tax returns', 'Income tax, turnover tax and VAT returns filed on time.', 'STARTING_FROM', 600], ['Payroll and NAPSA/NHIMA', 'Monthly payroll with statutory remittances.', 'PER_UNIT', 50, undefined, 'employee'], ['Annual financial statements', 'Year-end accounts prepared for audit or banks.', 'QUOTE']] },
  { cat: 'Business Consulting', tier: 'pro', mode: 'BOTH', names: ['{S} Consulting', '{A} Business Advisory', 'Kwacha Growth Partners'], tagline: 'Strategy, plans and funding readiness for SMEs',
    listings: [['Business plan writing', 'Bank- and investor-ready business plan with financial projections.', 'RANGE', 3000, 8000], ['SME strategy session', 'Half-day workshop on growth, pricing and operations.', 'FIXED', 2500], ['Grant and tender applications', 'Help preparing grant, CEEC and tender documents.', 'QUOTE']] },
  { cat: 'Software Development', tier: 'pro', mode: 'BOTH', names: ['{S} Software', 'Copperbelt Code Labs', '{A} Digital Studio', 'Zed Apps'], tagline: 'Custom apps and business systems',
    listings: [['Mobile app development', 'Android and iOS apps from design to Play Store launch.', 'QUOTE'], ['Point-of-sale and stock system', 'Sales, stock and reports for shops and pharmacies.', 'STARTING_FROM', 9000], ['Mobile money integration', 'Accept Airtel Money and MTN MoMo in your system.', 'STARTING_FROM', 5000]] },
  { cat: 'Web Development', tier: 'pro', mode: 'BOTH', names: ['{F} Web Design', '{S} Websites', '{A} Web Works'], tagline: 'Websites that bring you customers',
    listings: [['Business website (5 pages)', 'Responsive website with contact form and WhatsApp button.', 'FIXED', 4500], ['Online shop', 'E-commerce site with mobile money checkout.', 'STARTING_FROM', 9000], ['Domain and hosting setup', '.co.zm or .com domain, hosting and business email.', 'FIXED', 1200]] },
  { cat: 'Graphic Design', tier: 'pro', mode: 'BOTH', names: ['{F} Creative', '{S} Designs', 'Inkwell Studio {A}'], tagline: 'Logos, flyers and brand identity',
    listings: [['Logo design', 'Three concepts, two revisions, all file formats.', 'FIXED', 600], ['Flyer or poster design', 'Print-ready or social media sizes.', 'FIXED', 200], ['Full brand identity', 'Logo, colours, fonts, letterhead and business cards.', 'STARTING_FROM', 2500]] },
  { cat: 'Photography', tier: 'pro', mode: 'MOBILE', names: ['{F} {S} Photography', '{S} Studios', 'Golden Hour {A}'], tagline: 'Weddings, portraits and events',
    listings: [['Wedding photography', 'Full-day coverage with edited gallery.', 'STARTING_FROM', 6000], ['Portrait session', 'One hour, 20 edited photos.', 'FIXED', 800], ['Graduation photos', 'On-site graduation shoot, 15 edited photos.', 'FIXED', 500]] },
  { cat: 'Videography', tier: 'pro', mode: 'MOBILE', names: ['{S} Films', '{F} Visuals', '{A} Media House'], tagline: 'Event and commercial video',
    listings: [['Wedding video', 'Highlight film plus full ceremony edit.', 'STARTING_FROM', 7000], ['Promotional video', 'Short advert for social media or TV.', 'QUOTE'], ['Drone footage', 'Aerial shots for events and property.', 'HOURLY', 1200]] },
  { cat: 'Physiotherapy', tier: 'pro', mode: 'BOTH', names: ['{A} Physiotherapy Clinic', '{S} Physio & Rehab'], tagline: 'Registered physiotherapists',
    listings: [['Physiotherapy session', 'Assessment and treatment for back, neck and sports injuries.', 'FIXED', 450], ['Home physiotherapy visit', 'Rehabilitation at home after stroke or surgery.', 'FIXED', 650]] },
  { cat: 'Veterinary Services', tier: 'pro', mode: 'BOTH', names: ['{A} Veterinary Clinic', '{S} Animal Hospital'], tagline: 'Care for pets and livestock',
    listings: [['Vaccinations (dogs and cats)', 'Rabies and core vaccines with certificate.', 'FIXED', 250], ['Consultation', 'Examination and treatment plan.', 'FIXED', 300], ['Farm visit', 'Livestock checks, deworming and vaccination.', 'STARTING_FROM', 600]] },
  { cat: 'Agricultural Consultancy', tier: 'pro', mode: 'MOBILE', names: ['{S} Agro Advisory', '{A} Farm Consult'], tagline: 'Agronomy and farm planning',
    listings: [['Soil testing and advice', 'Soil samples analysed with a fertiliser plan.', 'FIXED', 900], ['Farm business plan', 'Crop and livestock plans for loans and investors.', 'QUOTE']] },
  { cat: 'Digital Marketing', tier: 'pro', mode: 'BOTH', names: ['{S} Marketing', 'Reach {A}', '{F} Digital'], tagline: 'Grow your business online',
    listings: [['Facebook & Instagram ads', 'Campaign setup and monthly management.', 'STARTING_FROM', 1500], ['Google Business profile setup', 'Get found on Google Maps.', 'FIXED', 450]] },
  { cat: 'Social Media Management', tier: 'pro', mode: 'MOBILE', names: ['{F} Social', '{S} Content Co.'], tagline: 'Content, posting and growth',
    listings: [['Monthly social media management', '12 posts a month, captions and replies.', 'STARTING_FROM', 1800], ['Content shoot', 'Photos and short videos for your pages.', 'FIXED', 900]] },
  { cat: 'Solar Installation', tier: 'pro', mode: 'MOBILE', names: ['{S} Solar', 'SunPower {A}', '{A} Energy Solutions'], tagline: 'Solar and backup power for load shedding',
    listings: [['Home solar system', 'Panels, inverter and batteries sized to your needs.', 'QUOTE'], ['Inverter installation', 'Backup power for lights, TV and fridge.', 'STARTING_FROM', 4500], ['Solar geyser installation', 'Supply and fit solar water heaters.', 'STARTING_FROM', 6500]] },
  { cat: 'Boreholes', tier: 'pro', mode: 'MOBILE', names: ['{S} Drilling', '{A} Borehole Services'], tagline: 'Drilling, pumps and water tanks',
    listings: [['Borehole drilling', 'Survey, drilling and casing.', 'QUOTE'], ['Pump installation', 'Submersible pump, tank stand and plumbing.', 'STARTING_FROM', 8000]] },
  // ── Skilled trades ──────────────────────────────────────────────
  { cat: 'Plumbing', tier: 'trade', weight: 3, mode: 'MOBILE', names: ['{S} Plumbing', '{A} Plumbers', '{F} the Plumber', 'FlowRight {A}'], tagline: 'Leaks, geysers and blocked drains',
    listings: [['Leak repair', 'Burst pipes, leaking taps and toilets fixed.', 'STARTING_FROM', 150], ['Geyser repair', 'Element, thermostat and valve replacement.', 'STARTING_FROM', 300], ['Blocked drain clearing', 'Sinks, toilets and outside drains.', 'FIXED', 250]] },
  { cat: 'Electrical', tier: 'trade', weight: 3, mode: 'MOBILE', names: ['{S} Electrical', '{A} Electricians', '{F} Electrical Works'], tagline: 'Wiring, faults and installations',
    listings: [['Electrical fault finding', 'Trips, sparks and dead sockets fixed.', 'STARTING_FROM', 150], ['Socket and light installation', 'New points, switches and fittings.', 'PER_UNIT', 120, undefined, 'point'], ['ZESCO meter connection prep', 'Wiring inspection and certificate.', 'QUOTE']] },
  { cat: 'Painting', tier: 'trade', mode: 'MOBILE', names: ['{S} Painters', '{F} Paint & Decor'], tagline: 'Interior and exterior painting',
    listings: [['Room painting', 'Walls and ceiling, two coats, labour only.', 'PER_UNIT', 450, undefined, 'room'], ['Exterior house painting', 'Wash, prime and paint.', 'QUOTE']] },
  { cat: 'Carpentry', tier: 'trade', mode: 'BOTH', names: ['{S} Carpentry', '{F} Furniture Works', '{A} Joinery'], tagline: 'Furniture, cupboards and doors',
    listings: [['Built-in wardrobes', 'Made to measure in melamine or hardwood.', 'STARTING_FROM', 3500], ['Kitchen units', 'Design, build and fit.', 'QUOTE'], ['Door fitting and repair', 'Hang, plane and fit locks.', 'FIXED', 300]] },
  { cat: 'Appliance Repair', tier: 'trade', mode: 'BOTH', names: ['{F} Fridge & Appliance Repair', '{A} Cooling Services'], tagline: 'Fridges, stoves and washing machines',
    listings: [['Fridge regassing', 'Leak check and regas.', 'FIXED', 450], ['Washing machine repair', 'Diagnosis and repair at home.', 'STARTING_FROM', 250], ['Aircon servicing', 'Clean, check gas and service.', 'FIXED', 500]] },
  { cat: 'Mechanics', tier: 'trade', weight: 3, mode: 'BOTH', names: ['{S} Motors', '{A} Auto Repairs', '{F} Garage', 'Mobile Mechanic {F}'], tagline: 'Servicing, diagnostics and repairs',
    listings: [['Minor service', 'Oil, filters and 20-point check.', 'FIXED', 650], ['Computer diagnosis', 'Engine light read and explained.', 'FIXED', 300], ['Brake pads replacement', 'Front or rear, labour included.', 'STARTING_FROM', 450]] },
  { cat: 'Panel Beating', tier: 'trade', mode: 'AT_LOCATION', names: ['{S} Panel Beaters', '{A} Body Shop'], tagline: 'Dent repair and spray painting',
    listings: [['Dent repair', 'Small dents and scratches.', 'STARTING_FROM', 400], ['Full respray', 'Strip, prepare and spray.', 'QUOTE']] },
  { cat: 'Tyre Services', tier: 'trade', mode: 'AT_LOCATION', names: ['{A} Tyre Centre', '{F} Tyres & Puncture'], tagline: 'Tyres, puncture repair and balancing',
    listings: [['Puncture repair', 'Tubeless or tube.', 'FIXED', 50], ['Wheel balancing', 'Per wheel.', 'PER_UNIT', 60, undefined, 'wheel']] },
  { cat: 'Welding', tier: 'trade', mode: 'BOTH', names: ['{S} Welding & Fabrication', '{A} Steel Works'], tagline: 'Gates, burglar bars and steel work',
    listings: [['Burglar bars', 'Made and fitted per window.', 'PER_UNIT', 650, undefined, 'window'], ['Sliding gate', 'Fabricated and installed.', 'QUOTE'], ['Welding repairs', 'On-site repairs.', 'STARTING_FROM', 200]] },
  { cat: 'Bricklaying', tier: 'trade', mode: 'MOBILE', names: ['{S} Builders', '{F} Construction'], tagline: 'Walls, extensions and fences',
    listings: [['Boundary wall building', 'Labour per metre.', 'PER_UNIT', 350, undefined, 'metre'], ['House extension', 'Foundation to roof level.', 'QUOTE']] },
  { cat: 'Roofing', tier: 'trade', mode: 'MOBILE', names: ['{S} Roofing', '{A} Roof Masters'], tagline: 'Roofs, leaks and gutters',
    listings: [['Roof leak repair', 'Find and seal leaks.', 'STARTING_FROM', 400], ['IBR roof installation', 'Trusses and sheets, labour.', 'QUOTE']] },
  { cat: 'Tiling', tier: 'trade', mode: 'MOBILE', names: ['{F} Tiling', '{S} Floors & Tiles'], tagline: 'Floor and wall tiling',
    listings: [['Floor tiling', 'Labour per square metre.', 'PER_UNIT', 60, undefined, 'm²'], ['Bathroom tiling', 'Walls and floor.', 'QUOTE']] },
  { cat: 'Phone Repair', tier: 'trade', weight: 3, mode: 'AT_LOCATION', names: ['{F} Phone Repairs', '{A} Mobile Clinic', 'FixIt {F}'], tagline: 'Screens, batteries and charging ports',
    listings: [['Screen replacement', 'Samsung, Tecno, Itel, iPhone.', 'STARTING_FROM', 250], ['Battery replacement', 'Most models while you wait.', 'STARTING_FROM', 150], ['Software flashing', 'Unlock and reinstall.', 'FIXED', 100]] },
  { cat: 'Computer Repair', tier: 'trade', mode: 'BOTH', names: ['{F} Computer Services', '{A} Laptop Clinic'], tagline: 'Laptops, desktops and printers',
    listings: [['Laptop repair', 'Screens, keyboards, hinges and charging.', 'STARTING_FROM', 300], ['Windows installation', 'With drivers and antivirus.', 'FIXED', 250]] },
  { cat: 'Electronics Repair', tier: 'trade', mode: 'AT_LOCATION', names: ['{F} TV & Electronics', '{A} Electronics Repair'], tagline: 'TVs, radios and decoders',
    listings: [['TV repair', 'LED and LCD TVs.', 'STARTING_FROM', 250], ['Decoder setup', 'DStv, GOtv and TopStar.', 'FIXED', 150]] },
  { cat: 'Tailoring', tier: 'trade', weight: 2, mode: 'AT_LOCATION', names: ['{F} Tailoring', '{A} Stitches', 'Mama {F} Designs'], tagline: 'Chitenge outfits and alterations',
    listings: [['Chitenge outfit', 'Made to measure, bring your fabric.', 'STARTING_FROM', 250], ['Alterations', 'Hems, taking in and repairs.', 'STARTING_FROM', 40], ["Men's suit", 'Tailored suit, fabric extra.', 'STARTING_FROM', 1500]] },
  { cat: 'Hairdressing', tier: 'trade', weight: 3, mode: 'BOTH', names: ["{F}'s Hair Studio", '{A} Salon', 'Crown & Curl {A}'], tagline: 'Braids, weaves and natural hair',
    listings: [['Box braids', 'Medium knotless braids.', 'FIXED', 350], ['Weave installation', 'Closure or frontal.', 'STARTING_FROM', 300], ['Wash and set', 'Treatment included.', 'FIXED', 120]] },
  { cat: 'Barbering', tier: 'trade', weight: 2, mode: 'AT_LOCATION', names: ['{F} Barbershop', '{A} Cuts', 'Sharp Edge {A}'], tagline: 'Fades, cuts and beard trims',
    listings: [['Haircut', 'Clipper cut or fade.', 'FIXED', 50], ['Fade and beard trim', 'Hot towel finish.', 'FIXED', 100]] },
  { cat: 'Makeup', tier: 'trade', mode: 'MOBILE', names: ['Glam by {F}', '{F} Makeup Artistry'], tagline: 'Bridal and event makeup',
    listings: [['Bridal makeup', 'Trial and wedding-day makeup.', 'FIXED', 1200], ['Event makeup', 'Full glam with lashes.', 'FIXED', 350]] },
  { cat: 'Massage', tier: 'trade', mode: 'BOTH', names: ['{F} Massage Therapy', '{A} Wellness Spa'], tagline: 'Relaxation and deep tissue',
    listings: [['Full body massage', 'One hour.', 'FIXED', 400], ['Deep tissue massage', 'One hour.', 'FIXED', 500]] },
  { cat: 'Personal Training', tier: 'trade', mode: 'MOBILE', names: ['Coach {F}', '{F} Fitness'], tagline: 'Weight loss and strength',
    listings: [['Personal training session', 'One hour at your home or gym.', 'HOURLY', 200], ['Monthly coaching plan', '12 sessions and a meal plan.', 'FIXED', 2000]] },
  { cat: 'Catering', tier: 'trade', weight: 2, mode: 'MOBILE', names: ['{S} Catering', '{A} Kitchen Events', "Mama {F}'s Catering"], tagline: 'Weddings, kitchen parties and funerals',
    listings: [['Event catering', 'Nshima, rice, relishes and salads.', 'PER_UNIT', 120, undefined, 'guest'], ['Corporate lunch', 'Delivered office lunches.', 'PER_UNIT', 90, undefined, 'plate']] },
  { cat: 'Cakes', tier: 'trade', weight: 2, mode: 'BOTH', names: ["{F}'s Cakes", '{A} Bakes', 'Sweet {F} Cakery'], tagline: 'Birthday and wedding cakes',
    listings: [['Birthday cake', 'Decorated sponge cake, 1 kg.', 'STARTING_FROM', 300], ['Wedding cake', 'Tiered cake to your design.', 'QUOTE'], ['Cupcakes', 'Box of 12.', 'FIXED', 180]] },
  { cat: 'DJs', tier: 'trade', mode: 'MOBILE', names: ['DJ {F}', 'DJ {F} {A}'], tagline: 'Weddings, parties and clubs',
    listings: [['DJ for events', 'Sound system and lights included.', 'STARTING_FROM', 1500]] },
  { cat: 'MCs', tier: 'trade', mode: 'MOBILE', names: ['MC {F}', 'MC {F} {S}'], tagline: 'Bilingual MC for weddings and events',
    listings: [['Wedding MC', 'English, Nyanja and Bemba.', 'STARTING_FROM', 1500]] },
  { cat: 'Event Decoration', tier: 'trade', mode: 'MOBILE', names: ['{F} Decor', '{A} Events Decor'], tagline: 'Draping, flowers and table settings',
    listings: [['Wedding decor', 'Draping, centrepieces and backdrop.', 'QUOTE'], ['Kitchen party decor', 'Theme decor for up to 100 guests.', 'STARTING_FROM', 2500]] },
  { cat: 'Tents and Chairs', tier: 'trade', mode: 'MOBILE', names: ['{S} Tent Hire', '{A} Events Hire'], tagline: 'Tents, chairs and tables',
    listings: [['Tent hire (100 guests)', 'Delivered and set up.', 'FIXED', 1800], ['Chair hire', 'Plastic chairs with covers.', 'PER_UNIT', 10, undefined, 'chair']] },
  { cat: 'Driving Lessons', tier: 'trade', mode: 'MOBILE', names: ['{S} Driving School', '{A} Driving Academy'], tagline: 'Learn to drive and pass RTSA',
    listings: [['Driving lessons package', '20 lessons with test preparation.', 'FIXED', 2500], ['Single lesson', 'One hour.', 'HOURLY', 150]] },
  { cat: 'Academic Tutors', tier: 'trade', weight: 2, mode: 'BOTH', names: ['Teacher {F}', '{S} Tuition Centre', '{A} Learning Hub'], tagline: 'Grades 7–12 and ECZ prep',
    listings: [['Maths tuition', 'One-on-one or small groups.', 'HOURLY', 100], ['Science tuition', 'Biology, chemistry and physics.', 'HOURLY', 100], ['English tuition', 'Reading, writing and exam prep.', 'HOURLY', 90]] },
  { cat: 'Music Lessons', tier: 'trade', mode: 'BOTH', names: ['{F} Music School', 'Keys by {F}'], tagline: 'Piano, guitar and voice',
    listings: [['Piano lessons', 'Beginners welcome.', 'HOURLY', 150], ['Guitar lessons', 'Acoustic and bass.', 'HOURLY', 120]] },
  { cat: 'Pet Grooming', tier: 'trade', mode: 'BOTH', names: ['{F} Pet Grooming', '{A} Pet Spa'], tagline: 'Baths, trims and nails',
    listings: [['Dog grooming', 'Bath, trim and nails.', 'STARTING_FROM', 200]] },
  { cat: 'Pest Control', tier: 'trade', mode: 'MOBILE', names: ['{S} Pest Control', '{A} Fumigators'], tagline: 'Cockroaches, termites and rodents',
    listings: [['House fumigation', 'Cockroaches, bedbugs and ants.', 'STARTING_FROM', 450], ['Termite treatment', 'Soil and wood treatment.', 'QUOTE']] },
  { cat: 'Deep Cleaning', tier: 'trade', mode: 'MOBILE', names: ['{S} Cleaning Services', 'Sparkle {A}', 'CleanPro {A}'], tagline: 'Homes, offices and move-outs',
    listings: [['Deep house clean', 'Kitchen, bathrooms, windows and floors.', 'STARTING_FROM', 800], ['Carpet and sofa cleaning', 'Steam cleaning.', 'PER_UNIT', 150, undefined, 'seat']] },
  { cat: 'Office Cleaning', tier: 'trade', mode: 'MOBILE', names: ['{S} Facility Services', '{A} Office Care'], tagline: 'Daily and weekly office cleaning',
    listings: [['Office cleaning contract', 'Daily or weekly, supplies included.', 'QUOTE']] },
  { cat: 'Moving Services', tier: 'trade', mode: 'MOBILE', names: ['{S} Movers', '{A} Removals'], tagline: 'House and office moves',
    listings: [['House move within Lusaka', 'Truck and loaders.', 'STARTING_FROM', 1500], ['Long-distance move', 'Copperbelt, Southern and beyond.', 'QUOTE']] },
  { cat: 'Car Hire', tier: 'trade', mode: 'AT_LOCATION', names: ['{S} Car Hire', '{A} Rentals'], tagline: 'Self-drive and chauffeur',
    listings: [['Saloon car hire', 'Toyota Corolla or similar.', 'PER_UNIT', 650, undefined, 'day'], ['SUV hire', 'With or without driver.', 'PER_UNIT', 1400, undefined, 'day']] },
  { cat: 'Home Care', tier: 'trade', mode: 'MOBILE', names: ['{S} Home Nursing', '{A} Care Services'], tagline: 'Qualified home nurses and carers',
    listings: [['Home nurse visit', 'Wound dressing, injections and monitoring.', 'FIXED', 350], ['Live-in carer', 'Monthly, for elderly or post-surgery care.', 'QUOTE']] },
  // ── Casual / informal ───────────────────────────────────────────
  { cat: 'Cleaning', tier: 'casual', weight: 3, mode: 'MOBILE', names: ['{F} {S}', '{F} Cleaning'], tagline: 'House cleaning by the day',
    listings: [['House cleaning', 'Sweeping, mopping, dishes and dusting.', 'PER_UNIT', 150, undefined, 'day'], ['Window cleaning', 'Inside and out.', 'STARTING_FROM', 100]] },
  { cat: 'Laundry and Ironing', tier: 'casual', weight: 3, mode: 'MOBILE', names: ['{F} {S}', '{F} Laundry'], tagline: 'Washing and ironing, pickup available',
    listings: [['Wash and iron', 'Per load, pickup included nearby.', 'PER_UNIT', 80, undefined, 'load'], ['Ironing only', 'Per bundle of 20 items.', 'FIXED', 60]] },
  { cat: 'Gardening and Yard Work', tier: 'casual', weight: 3, mode: 'MOBILE', names: ['{F} {S}', '{F} Gardening'], tagline: 'Grass cutting and yard clean-ups',
    listings: [['Grass cutting', 'Slashing or mowing, yard cleared.', 'STARTING_FROM', 80], ['Hedge trimming', 'Shape and tidy hedges.', 'STARTING_FROM', 100]] },
  { cat: 'House Helpers', tier: 'casual', weight: 2, mode: 'MOBILE', names: ['{F} {S}'], tagline: 'Experienced house help',
    listings: [['Full-time house help', 'Cleaning, laundry and cooking.', 'PER_UNIT', 1800, undefined, 'month'], ['Part-time house help', 'Three days a week.', 'PER_UNIT', 1000, undefined, 'month']] },
  { cat: 'Babysitting', tier: 'casual', weight: 2, mode: 'MOBILE', names: ['{F} {S}', 'Aunty {F}'], tagline: 'Reliable babysitting, evenings and weekends',
    listings: [['Babysitting', 'Evenings and weekends.', 'HOURLY', 40]] },
  { cat: 'Nannies', tier: 'casual', mode: 'MOBILE', names: ['{F} {S}'], tagline: 'Experienced nanny',
    listings: [['Live-out nanny', 'Weekdays, references available.', 'PER_UNIT', 2000, undefined, 'month']] },
  { cat: 'Home-Cooked Meals', tier: 'casual', weight: 2, mode: 'BOTH', names: ["{F}'s Kitchen", "Mama {F}'s Meals"], tagline: 'Nshima, relishes and home cooking',
    listings: [['Nshima with relish', 'Chicken, beef or kapenta with vegetables.', 'FIXED', 45], ['Weekly lunch box', 'Five lunches delivered to your office.', 'FIXED', 220]] },
  { cat: 'Baking', tier: 'casual', mode: 'BOTH', names: ["{F}'s Bakes", '{F} Home Bakery'], tagline: 'Fritters, buns and bread',
    listings: [['Fritters (vitumbuwa)', 'Fresh every morning, per dozen.', 'FIXED', 30], ['Scones', 'Per dozen.', 'FIXED', 50]] },
  { cat: 'Motorcycle Delivery', tier: 'casual', weight: 2, mode: 'MOBILE', names: ['{F} Deliveries', '{F} Express'], tagline: 'Fast motorbike deliveries across town',
    listings: [['Same-day delivery', 'Documents and small parcels.', 'STARTING_FROM', 50]] },
  { cat: 'Taxi', tier: 'casual', weight: 2, mode: 'MOBILE', names: ['{F} {S} Taxi', '{F} Cabs'], tagline: 'Town trips and airport runs',
    listings: [['Airport transfer', 'Kenneth Kaunda International Airport.', 'FIXED', 350], ['Town trip', 'Within Lusaka.', 'STARTING_FROM', 60]] },
  { cat: 'Truck Hire', tier: 'casual', mode: 'MOBILE', names: ['{F} Transport', '{S} Canter Hire'], tagline: 'Canter and pickup for hire',
    listings: [['Canter hire', 'With driver, within Lusaka.', 'STARTING_FROM', 700], ['Pickup hire', 'Small loads.', 'STARTING_FROM', 350]] },
  { cat: 'Shoe Repair', tier: 'casual', mode: 'AT_LOCATION', names: ['{F} Shoe Repairs', 'Cobbler {F}'], tagline: 'Soles, heels and stitching',
    listings: [['Shoe resoling', 'Per pair.', 'FIXED', 80], ['Shoe polishing', 'Per pair.', 'FIXED', 15]] },
  { cat: 'Bicycle Repair', tier: 'casual', mode: 'AT_LOCATION', names: ['{F} Bicycle Repairs'], tagline: 'Punctures, chains and brakes',
    listings: [['Puncture repair', 'Bicycle tubes.', 'FIXED', 20], ['Bicycle service', 'Brakes, chain and gears.', 'FIXED', 80]] },
  { cat: 'Mobile Money Agents', tier: 'casual', weight: 2, mode: 'AT_LOCATION', names: ['{F} Money Booth', '{A} Mobile Money'], tagline: 'Airtel Money, MTN MoMo & Zamtel Kwacha',
    listings: [['Deposits and withdrawals', 'All networks, float most of the day.', 'NEGOTIABLE']] },
  { cat: 'Farm Workers', tier: 'casual', mode: 'MOBILE', names: ['{F} {S}'], tagline: 'Piece work on farms and plots',
    listings: [['Field labour', 'Ploughing, weeding and harvesting.', 'PER_UNIT', 100, undefined, 'day']] },
  { cat: 'Garbage Collection', tier: 'casual', mode: 'MOBILE', names: ['{F} Waste Collection', '{A} Rubbish Removal'], tagline: 'Weekly rubbish collection',
    listings: [['Weekly collection', 'Household rubbish, per month.', 'PER_UNIT', 150, undefined, 'month'], ['Once-off yard clearing', 'Rubble and garden waste.', 'STARTING_FROM', 300]] },
  { cat: 'Assistants', tier: 'casual', mode: 'MOBILE', names: ['{F} {S}'], tagline: 'Errands, queues and admin help',
    listings: [['Errands and queueing', 'Bank, PACRA, RTSA and shopping errands.', 'HOURLY', 50], ['Typing and data entry', 'Per page.', 'PER_UNIT', 10, undefined, 'page']] },
  { cat: 'CV Writing', tier: 'casual', mode: 'MOBILE', names: ['{F} CV Services'], tagline: 'CVs and cover letters that get interviews',
    listings: [['CV writing', 'Professional CV in Word and PDF.', 'FIXED', 150], ['Cover letter', 'Tailored to the job.', 'FIXED', 80]] },
  // ── Products ────────────────────────────────────────────────────
  { cat: 'Vegetables and Groceries', tier: 'casual', weight: 3, product: true, mode: 'AT_LOCATION', names: ['{F} Vegetables', '{A} Fresh Produce', "Mama {F}'s Stand"], tagline: 'Fresh vegetables daily',
    listings: [['Tomatoes', 'Fresh, per 5 kg box.', 'PER_UNIT', 60, undefined, 'box'], ['Rape and cabbage', 'Per bundle.', 'PER_UNIT', 10, undefined, 'bundle'], ['Onions', 'Per 10 kg pocket.', 'PER_UNIT', 120, undefined, 'pocket']] },
  { cat: 'Charcoal', tier: 'casual', product: true, mode: 'BOTH', names: ['{F} Charcoal', '{A} Charcoal Supply'], tagline: 'Charcoal by the bag',
    listings: [['Charcoal (50 kg bag)', 'Dense, long-burning.', 'PER_UNIT', 220, undefined, 'bag']] },
  { cat: 'Poultry', tier: 'casual', weight: 2, product: true, mode: 'AT_LOCATION', names: ['{S} Poultry', '{A} Chickens', '{F} Farm'], tagline: 'Broilers, village chickens and eggs',
    listings: [['Live broilers', 'Six weeks old.', 'PER_UNIT', 120, undefined, 'bird'], ['Eggs (tray of 30)', 'Fresh farm eggs.', 'PER_UNIT', 75, undefined, 'tray'], ['Village chicken', 'Free range.', 'PER_UNIT', 180, undefined, 'bird']] },
  { cat: 'Meat Suppliers', tier: 'trade', product: true, mode: 'AT_LOCATION', names: ['{A} Butchery', '{S} Fresh Meats'], tagline: 'Fresh beef, goat and pork',
    listings: [['Beef (mixed cuts)', 'Cut to order.', 'PER_UNIT', 95, undefined, 'kg'], ['Goat meat', 'Fresh daily.', 'PER_UNIT', 110, undefined, 'kg'], ['T-bone steak', 'Per kg.', 'PER_UNIT', 130, undefined, 'kg']] },
  { cat: 'Construction Materials', tier: 'trade', product: true, mode: 'AT_LOCATION', names: ['{S} Hardware', '{A} Building Supplies'], tagline: 'Cement, blocks and roofing',
    listings: [['Cement (50 kg)', 'Per bag, delivery available.', 'PER_UNIT', 165, undefined, 'bag'], ['Concrete blocks', '6-inch blocks.', 'PER_UNIT', 9, undefined, 'block'], ['River sand', 'Per tonne, delivered.', 'PER_UNIT', 450, undefined, 'tonne']] },
  { cat: 'Clothing Sales', tier: 'casual', weight: 2, product: true, mode: 'AT_LOCATION', names: ['{F} Boutique', '{A} Salaula', '{F} Fashion'], tagline: 'Quality clothes at good prices',
    listings: [['Salaula bales', 'Mixed second-hand clothing.', 'NEGOTIABLE'], ['Ladies dresses', 'New arrivals weekly.', 'STARTING_FROM', 150], ['Chitenge fabric', 'Per 2-yard piece.', 'PER_UNIT', 120, undefined, 'piece']] },
  { cat: 'Animal Feed', tier: 'trade', product: true, mode: 'AT_LOCATION', names: ['{A} Stockfeeds', '{S} Agro Supplies'], tagline: 'Poultry, pig and cattle feed',
    listings: [['Broiler starter', '50 kg bag.', 'PER_UNIT', 520, undefined, 'bag'], ['Dairy meal', '50 kg bag.', 'PER_UNIT', 380, undefined, 'bag']] },
  { cat: 'Household Essentials', tier: 'casual', product: true, mode: 'AT_LOCATION', names: ['{F} Tuck Shop', '{A} Mini Mart'], tagline: 'Everyday groceries and household items',
    listings: [['Mealie meal (25 kg)', 'Breakfast meal.', 'PER_UNIT', 240, undefined, 'bag'], ['Cooking oil (2 L)', 'Per bottle.', 'PER_UNIT', 85, undefined, 'bottle']] },
];

const FIRST = ['Mwila', 'Chanda', 'Bwalya', 'Mulenga', 'Natasha', 'Kondwani', 'Thandiwe', 'Chipo', 'Mutale', 'Joseph', 'Grace', 'Ruth', 'Moses', 'Mary', 'Peter', 'Agnes', 'Elijah', 'Mercy', 'Daniel', 'Esther', 'Brian', 'Lillian', 'Kelvin', 'Precious', 'Charles', 'Memory', 'Gift', 'Patience', 'Emmanuel', 'Mapalo', 'Musonda', 'Kabwe', 'Nchimunya', 'Lungowe', 'Inonge', 'Mubanga', 'Chileshe', 'Twaambo', 'Choolwe', 'Namakau', 'Mwape', 'Kasonde', 'Lweendo', 'Mumba', 'Chola', 'Taonga', 'Wezi', 'Kunda', 'Martha', 'Victor', 'Joyce', 'Felix', 'Doreen', 'Isaac', 'Beatrice', 'Steven', 'Faith', 'Collins', 'Prudence', 'Kennedy'];
const SURNAMES = ['Banda', 'Phiri', 'Mwanza', 'Tembo', 'Zulu', 'Lungu', 'Mulenga', 'Chileshe', 'Sakala', 'Kabwe', 'Mbewe', 'Chola', 'Mwale', 'Nkandu', 'Daka', 'Ngoma', 'Bwalya', 'Musonda', 'Kapata', 'Simwanza', 'Hamoonga', 'Mudenda', 'Siame', 'Kaunda', 'Mumba', 'Chirwa', 'Nyirenda', 'Mvula', 'Sichone', 'Kalaba', 'Mutale', 'Chisanga', 'Lubinda', 'Mubita', 'Habeenzu', 'Moono', 'Kasonde', 'Nkhata', 'Soko', 'Kangwa'];
const BIO: Record<Tier, string[]> = {
  pro: ['Registered and fully compliant, serving individuals and businesses across {C}.', 'A qualified team with over {Y} years of experience. Written quotes and invoices provided.', 'Professional service with clear pricing and agreed timelines. Corporate clients welcome.'],
  trade: ['Experienced and reliable, {Y} years in the trade. Based in {A}, serving nearby areas.', 'Quality work at fair prices. Call or WhatsApp to book.', 'Trusted by families and small businesses in {A} and surrounds.'],
  casual: ['Hard-working and honest. Available most days around {A}.', 'Affordable and reliable. References available on request.', 'Based in {A}. Message me to agree a time.'],
};
const COMMENTS = ['Excellent work, on time and fair price.', 'Very professional. Will use again.', 'Good service, a bit late but quality was great.', 'Highly recommend!', 'Friendly and quick.', 'Did a decent job for the price.', 'Answered on WhatsApp straight away.', 'Not cheap but worth it.'];

/** Deterministic PRNG so a run is reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function remove() {
  // Photos added by bulk-images.ts: delete the stored files (rows go with their owner below).
  const e = env();
  const driver = e.STORAGE_DRIVER === 'r2' ? new R2StorageDriver(e) : new LocalStorageDriver(e);
  const photos = await prisma.media.findMany({ where: { storageKey: { startsWith: 'bulk-test/' } }, select: { storageKey: true } });
  for (const m of photos) await driver.remove(m.storageKey).catch(() => undefined);
  if (photos.length) console.log(`Removed ${photos.length} bulk photo files.`);
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    // Provider, listings, locations, reviews etc. cascade from the user.
    const r = await prisma.user.deleteMany({ where: { id: { in: ids.slice(i, i + 200) } } });
    done += r.count;
  }
  console.log(`Removed ${done} bulk accounts (providers, listings and reviews with them).`);
}

async function create(count: number) {
  if (await prisma.user.findFirst({ where: { email: { endsWith: DOMAIN } } })) {
    console.log('Bulk providers already present: run with --remove first to recreate them.');
    return;
  }
  const rand = rng(20261126);
  const pick = <X>(a: X[]) => a[Math.floor(rand() * a.length)]!;
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const cats = new Map((await prisma.category.findMany({ where: { parentId: { not: null } } })).map((c) => [c.name, c.id]));
  for (const t of TEMPLATES) if (!cats.has(t.cat)) throw new Error(`Unknown category ${t.cat}`);
  const lusaka = PLACES.filter((p) => p.kind === 'neighbourhood');
  const towns = PLACES.filter((p) => p.kind === 'town');
  const weighted = TEMPLATES.flatMap((t) => Array<T>(t.weight ?? 1).fill(t));
  // Nobody knows this password: bulk accounts can't be signed into.
  const passwordHash = await argon2.hash(randomBytes(24).toString('hex'), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const customers: string[] = [];
  for (let i = 0; i < 40; i++) {
    const u = await prisma.user.create({
      data: { email: `customer.${i + 1}${DOMAIN}`, fullName: `${pick(FIRST)} ${pick(SURNAMES)}`, passwordHash, emailVerifiedAt: new Date(), notificationPreference: { create: {} } },
    });
    customers.push(u.id);
  }

  let listings = 0;
  for (let i = 0; i < count; i++) {
    const t = pick(weighted);
    const place = rand() < 0.75 ? pick(lusaka) : pick(towns);
    const first = pick(FIRST);
    const surname = pick(SURNAMES);
    const name = pick(t.names).replace('{S2}', pick(SURNAMES)).replace('{S}', surname).replace('{F}', first).replace('{A}', place.name);
    const owner = `${first} ${surname}`;
    const phone = `+2609710${String(10000 + i).padStart(5, '0')}`;
    const spread = place.kind === 'town' ? 0.04 : 0.012;
    const lat = place.lat + (rand() - 0.5) * spread;
    const lng = place.lng + (rand() - 0.5) * spread;
    const business = t.tier === 'pro' || (t.tier === 'trade' && rand() < 0.5) || /Studio|Services|Clinic|& |Ltd|Hardware|Butchery|Centre/.test(name);
    const verified = t.tier === 'pro' ? rand() < 0.7 : t.tier === 'trade' ? rand() < 0.35 : rand() < 0.1;
    const years = between(2, t.tier === 'pro' ? 20 : 12);
    const bio = pick(BIO[t.tier]).replace('{A}', place.name).replace('{C}', place.city).replace('{Y}', String(years));
    const radius = t.mode === 'AT_LOCATION' ? null : between(3, t.tier === 'pro' ? 40 : 15);
    // Price varies by provider: ±30%, rounded to a friendly figure.
    const factor = 0.7 + rand() * 0.6;
    const price = (p?: number) => (p == null ? null : p < 100 ? Math.max(5, Math.round((p * factor) / 5) * 5) : Math.round((p * factor) / 10) * 10);
    const chosen = [...t.listings].sort(() => rand() - 0.5).slice(0, between(1, t.listings.length));

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: `provider.${i + 1}${DOMAIN}`, fullName: owner, passwordHash, emailVerifiedAt: new Date(), notificationPreference: { create: {} } },
      });
      const provider = await tx.provider.create({
        data: {
          userId: user.id,
          slug: `${slugify(name)}-${i + 1}-bulk`,
          type: business ? 'BUSINESS' : 'INDIVIDUAL',
          displayName: name,
          tagline: t.tagline,
          bio,
          phone,
          whatsapp: phone,
          serviceMode: t.mode,
          serviceRadiusKm: radius,
          status: 'ACTIVE',
          onboardingStep: 11,
          publishedAt: new Date(Date.now() - between(0, 120) * 86400_000),
          verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: verified ? new Date() : null,
          primaryCategoryId: cats.get(t.cat),
          availability: {
            create: (t.tier === 'casual' ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5, 6]).map((day) => ({
              dayOfWeek: day,
              startTime: t.tier === 'pro' ? '08:00' : '07:00',
              endTime: day === 6 || day === 0 ? '13:00' : t.tier === 'pro' ? '17:00' : '18:00',
            })),
          },
        },
      });
      await tx.$executeRaw`
        INSERT INTO "ProviderLocation" ("providerId", "label", "area", "city", "location", "publicLocation", "showExactLocation", "isPrimary")
        VALUES (${provider.id}::uuid, 'Main', ${place.name}, ${place.city},
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${Math.round(lng * 200) / 200}, ${Math.round(lat * 200) / 200}), 4326)::geography,
                false, true)`;
      if (radius) {
        await tx.$executeRaw`
          INSERT INTO "ServiceArea" ("providerId", "name", "center", "radiusKm")
          VALUES (${provider.id}::uuid, ${`${place.name} and surrounds`}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})`;
      }
      for (const [title, description, priceType, p, pMax, unit] of chosen) {
        const lo = price(p);
        await tx.listing.create({
          data: {
            providerId: provider.id,
            type: t.product ? 'PRODUCT' : 'SERVICE',
            title,
            description,
            categoryId: cats.get(t.cat)!,
            priceType,
            price: priceType === 'QUOTE' || priceType === 'NEGOTIABLE' ? null : lo,
            priceMax: pMax != null && lo != null ? Math.max(lo + 10, price(pMax)!) : null,
            unit: unit ?? null,
            keywords: [t.cat.toLowerCase()],
            status: 'ACTIVE',
            publishedAt: new Date(Date.now() - between(0, 90) * 86400_000),
            qualityScore: t.tier === 'pro' ? between(55, 85) : between(35, 70),
            ...(t.product ? { productDetails: { create: { deliveryAvailable: rand() < 0.5, deliveryRadiusKm: 8 } } } : { serviceDetails: { create: {} } }),
          },
        });
        listings++;
      }
      // 0–6 reviews; some providers stay unreviewed, like real new listings.
      const reviewers = [...customers].sort(() => rand() - 0.5).slice(0, rand() < 0.3 ? 0 : between(1, 6));
      for (const authorId of reviewers) {
        await tx.contactEvent.create({ data: { providerId: provider.id, userId: authorId, channel: rand() < 0.7 ? 'WHATSAPP' : 'PHONE' } });
        const r = rand();
        await tx.review.create({
          data: { providerId: provider.id, authorId, rating: r < 0.55 ? 5 : r < 0.85 ? 4 : r < 0.95 ? 3 : 2, comment: pick(COMMENTS), isVerifiedInteraction: true },
        });
      }
    });
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${count} providers`);
  }

  await prisma.$executeRaw`
    UPDATE "Provider" p SET
      "ratingAverage" = coalesce((SELECT round(avg("rating")::numeric, 2) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED'), 0),
      "ratingCount" = (SELECT count(*) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED')
    WHERE p."slug" LIKE '%-bulk'`;
  console.log(`Created ${count} bulk providers with ${listings} listings (remove with --remove).`);
}

const args = process.argv.slice(2);
const countArg = args.indexOf('--count');
const run = args.includes('--remove') ? remove() : create(countArg >= 0 ? Number(args[countArg + 1]) : 1000);
run
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
