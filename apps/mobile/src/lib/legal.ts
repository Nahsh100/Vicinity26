/**
 * Privacy policy and terms of use, as structured text rendered by components/LegalDocument.
 *
 * DRAFT written from how the product actually works (Nov 2026). Have it reviewed by a Zambian
 * lawyer before launch, and confirm the operator details below (legal name, address, mailboxes).
 */

export const LEGAL = {
  /** Registered name of the business that operates Vicinity. Confirm before launch. */
  operator: 'Vicinity Zambia',
  location: 'Lusaka, Zambia',
  privacyEmail: 'privacy@vicinityzambia.com',
  supportEmail: 'support@vicinityzambia.com',
  website: 'https://vicinityzambia.com',
  updated: '26 November 2026',
} as const;

export type LegalBlock = string | { list: string[] };
export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}
export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

const L = LEGAL;

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy policy',
  summary: `How ${L.operator} collects, uses and protects your information when you use the Vicinity app and website.`,
  sections: [
    {
      heading: 'Who we are',
      body: [
        `Vicinity is a local services marketplace operated by ${L.operator} (${L.location}). We are the controller of the personal data described here, under the Data Protection Act No. 3 of 2021 of Zambia.`,
        `Questions or requests: ${L.privacyEmail}.`,
      ],
    },
    {
      heading: 'What we collect',
      body: [
        { list: [
          'Account details: your name, email address and/or mobile number, password (stored only as a secure hash), profile photo, bio and the area you live in.',
          'Sign-in with Google or Apple: your provider account ID, name and email address as shared by Google or Apple. Apple may give us a private relay address instead of your real email.',
          'Location: the place you choose or, with your permission, your device location, used to show what is near you. Searches store your area rounded to about 1 km, never your exact position.',
          'Provider information: business name, services and products, prices, photos and videos, working hours, service areas, business locations, contact numbers and any documents you upload for verification.',
          'Activity: bookings, messages, enquiries, reviews, saved providers and listings, organizations and groups you join, and reports you make.',
          'Payments: plan purchases (amount, plan, the mobile money number used and the payment status). We never see or store your mobile money PIN.',
          'Usage and device data: searches, profile views and contact taps (to show providers their statistics), push notification tokens, IP address, browser or app version, and security logs.',
        ] },
      ],
    },
    {
      heading: 'How we use it',
      body: [
        { list: [
          'To run the service: create your account, show listings near you, handle bookings, messages and reviews, and send the notifications you choose.',
          'To keep it safe: verify phone numbers and emails, detect fraud and abuse, review reported content and verify providers who apply.',
          'To process plan payments and keep the records the law requires.',
          'To give providers statistics about their own storefront (for example views and contact taps), without identifying you to them.',
          'To improve Vicinity using aggregated usage information.',
        ] },
        'We rely on performing our contract with you, our legitimate interest in a safe and working marketplace, legal obligations, and your consent where we ask for it (for example device location, promotional notifications).',
      ],
    },
    {
      heading: 'What other users can see',
      body: [
        { list: [
          'Provider storefronts are public: business name, description, listings, photos, reviews, the area and an approximate map pin (about 500 m) unless the provider chooses to show an exact address.',
          'Your reviews show your name and profile photo.',
          'When you book a provider, they see your name and, while the booking is open, your phone number so they can reach you.',
          'Messages are visible only to you and the person you are talking to (and to our team when investigating a report).',
          'Members-only listings are visible only to members of that organization.',
          'Verification documents are never public: only you and our verification team can open them.',
        ] },
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We do not sell your personal data. We share it only with service providers that help us run Vicinity, under contracts that limit their use of it:',
        { list: [
          'Hosting and storage: Railway (servers and database), Vercel (website) and Cloudflare R2 (photos and documents).',
          'Payments: Lenco, for mobile money plan payments (MTN, Airtel, Zamtel).',
          'Messages: Zamtel (SMS sign-in codes), Resend (email) and Expo (push notifications).',
          'Sign-in: Google and Apple, when you choose to sign in with them.',
          'Maps: OpenFreeMap (web map tiles), Apple Maps and Google Maps on phones. These receive the map area being viewed, not your account details.',
        ] },
        'We may also disclose information when the law requires it, or to protect the safety of our users and the public.',
      ],
    },
    {
      heading: 'Where your data is stored',
      body: [
        'Some of these services store or process data outside Zambia. Where they do, we take steps required by the Data Protection Act to keep your data protected, including contractual safeguards with each provider.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        { list: [
          'Account information: for as long as your account is open.',
          'When you delete your account, we remove your profile, contact details, sessions, memberships and saved items, and hide your storefront and listings. Reviews you wrote stay visible as "Deleted user".',
          'Detailed usage events: 90 days, after which only daily totals are kept.',
          'Payment and security records: as long as needed for accounting, legal and fraud-prevention purposes.',
        ] },
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You can ask to access, correct or delete your personal data, object to or restrict how we use it, withdraw consent you gave, and receive a copy of your data.',
        { list: [
          'Download your data: Profile → Account & security → Export my data.',
          'Delete your account: Profile → Account & security → Delete my account.',
          'Manage notifications and location access in the app settings or on your device.',
        ] },
        `For anything else, write to ${L.privacyEmail}. We will respond within the time the law requires. You may also complain to the Office of the Data Protection Commissioner of Zambia.`,
      ],
    },
    {
      heading: 'Security',
      body: [
        'Passwords and sign-in codes are stored only as one-way hashes, connections are encrypted, private files are served through short-lived links, and access by our team is limited by role and logged. No system is perfectly secure, so please keep your sign-in details private and tell us if you suspect misuse.',
      ],
    },
    {
      heading: 'Cookies and local storage',
      body: [
        'The website uses your browser’s local storage to keep you signed in and remember preferences such as your location. We do not use advertising cookies. If you use “Continue with Google”, Google’s sign-in script may set its own cookies under Google’s policy.',
      ],
    },
    {
      heading: 'Children',
      body: ['Vicinity is for people aged 18 and over. We do not knowingly collect data from children; contact us if you believe a child has created an account.'],
    },
    {
      heading: 'Changes',
      body: ['We may update this policy. We will show the new date at the top and tell you in the app about significant changes.'],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of use',
  summary: `The rules for using Vicinity, operated by ${L.operator}. By creating an account or using the service you agree to them.`,
  sections: [
    {
      heading: 'What Vicinity is',
      body: [
        'Vicinity helps people find, contact and book local providers. We are a platform: services and products are offered and delivered by independent providers, not by us. Any agreement for a service or product is between the customer and the provider.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        { list: [
          'You must be 18 or older and give accurate information.',
          'Keep your password, phone and sign-in codes private. You are responsible for activity on your account.',
          'One person per account. Businesses may be managed by their owner.',
        ] },
      ],
    },
    {
      heading: 'Providers',
      body: [
        { list: [
          'Listings must be accurate, lawful and kept up to date, including prices and availability.',
          'You are responsible for the quality and safety of your work and for any licences, permits and taxes that apply to your business.',
          'The Verified badge means our team reviewed details you submitted. It is not a guarantee of your work.',
          'You keep ownership of your content and give us a licence to display and promote it on Vicinity while it is listed.',
        ] },
      ],
    },
    {
      heading: 'Bookings',
      body: [
        { list: [
          'A booking request is confirmed only when the provider accepts it. Either side can propose a new time or cancel, with a reason.',
          'Vicinity does not charge booking fees. Payment for services is agreed and made directly between customer and provider.',
          'Please cancel early if you cannot attend; repeated no-shows or abuse may lead to restrictions.',
        ] },
      ],
    },
    {
      heading: 'Plans and payments',
      body: [
        { list: [
          'Basic listing and discovery are free. Paid plans (for example Pro and Business) add capacity and features, at the prices shown in the app in Zambian kwacha.',
          'Plans are paid with mobile money through our payment partner and run for the period you choose. They do not renew automatically.',
          'Upgrading starts the new plan straight away and converts the unused value of your current plan into extra days.',
          `If a payment went wrong, contact ${L.supportEmail}. Nothing in these terms limits your rights under Zambian consumer protection law.`,
        ] },
      ],
    },
    {
      heading: 'Reviews and content',
      body: [
        'Reviews must reflect a genuine experience with the provider. Do not post content that is false, abusive, discriminatory, sexual, illegal, or that infringes someone else’s rights. We may moderate, hide or remove content and act on reports.',
      ],
    },
    {
      heading: 'Things you must not do',
      body: [
        { list: [
          'Impersonate others, create fake accounts, reviews or listings, or manipulate ratings.',
          'Use Vicinity to harass, scam or spam people, or to offer illegal goods or services.',
          'Scrape, copy or interfere with the service, or try to access other people’s data.',
        ] },
      ],
    },
    {
      heading: 'Suspension and closing accounts',
      body: [
        'We may suspend or remove accounts, listings or content that break these terms or put users at risk. You can delete your account at any time in Account & security.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        'We work to keep Vicinity available and accurate, but we provide it “as is” and do not guarantee providers, their services or products. To the extent the law allows, we are not liable for losses arising from dealings between customers and providers, or for indirect losses. Nothing here excludes liability that cannot be excluded by law.',
      ],
    },
    {
      heading: 'Law and changes',
      body: [
        'These terms are governed by the laws of the Republic of Zambia. We may update them; continued use after a change means you accept the new terms, and we will tell you about significant changes in the app.',
        `Questions: ${L.supportEmail}.`,
      ],
    },
  ],
};
