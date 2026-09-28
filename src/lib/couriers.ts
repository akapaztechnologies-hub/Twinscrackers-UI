/**
 * Courier registry for order tracking.
 *
 * `mode` is the honest answer to "what can the shop find out about this
 * parcel?", and it has three values because there are three real situations.
 * The backend's `COURIER_TRACKING` carries the same three, and the two must
 * agree — a courier marked auto here but not there means an admin is offered a
 * "Check status" button that always fails.
 *
 *   'auto'     — the backend can fetch live status. Only couriers whose own
 *                tracking page calls an endpoint the server can call too,
 *                verified against the live site — AKR and A1, both JSON.
 *   'deeplink' — the courier has a real tracking page, but it is behind an API
 *                key (Delhivery answers a bare request with 401) or an ASP.NET
 *                VIEWSTATE postback (TCI). The customer is sent there with
 *                their number.
 *   'manual'   — no online tracking exists at all. Most Sivakasi road-parcel
 *                lines are here. The shop types updates in as the booking
 *                office phones them through.
 *
 * Everything used to be treated as auto-trackable through a trackcourier.io
 * scrape that could never work — the site renders results client-side, so the
 * parse found zero events for every courier, every time, and nothing on screen
 * said so. Hence the mode.
 *
 * Ordered with the Sivakasi / Tamil Nadu lines first, which is what these shops
 * actually ship on.
 */
export type TrackingMode = 'auto' | 'deeplink' | 'manual';

export interface CourierOption {
  slug: string;
  name: string;
  /** The courier's OWN tracking page. `''` means it has none. */
  trackUrl: string;
  mode: TrackingMode;
  /** Shown in the admin when the mode needs explaining. */
  note?: string;
}

export const COURIERS: CourierOption[] = [
  // — Tamil Nadu / Sivakasi parcel lines —
  {
    slug: 'akr-express',
    name: 'AKR Express Parcel Service',
    trackUrl: 'https://akrexpress.com/track/',
    mode: 'auto',
  },
  {
    slug: 'a1parcel',
    name: 'A1 Travels / Speed Parcel',
    trackUrl: 'https://www.a1parcel.in/tracking',
    mode: 'auto',
    note: 'Needs the delivery phone number, which is taken from the order.',
  },
  {
    slug: 'pps-parcel',
    name: 'Prakash Parcel Service (PPS)',
    trackUrl: 'https://www.pps.in/track/',
    mode: 'auto',
    note: 'Tracked by GC number, not AWB.',
  },
  {
    slug: 'arc-carrier',
    name: 'ARC — Associated Road Carriers',
    trackUrl: 'https://online.arclimited.com/cnstrk/cnstrk.aspx',
    mode: 'deeplink',
    note: 'Their tracker needs a login, so the customer looks it up themselves.',
  },
  {
    // Was `tracking.aspx` — a 404. ABT publishes no tracker anywhere on its site.
    slug: 'abt-parcel',
    name: 'ABT Parcel Service (ABT Logistics)',
    trackUrl: '',
    mode: 'manual',
    note: 'ABT has no online tracking.',
  },
  {
    // Was `track.php`, which 301s. The live page is `/tracking/`.
    slug: 'mettur-transport',
    name: 'Mettur Super Services (MSS)',
    trackUrl: 'https://www.metturtransports.com/tracking/',
    mode: 'manual',
    note: 'Their tracker is a plain form with no result the server can read.',
  },
  {
    slug: 'kpn-parcel',
    name: 'KPN Speed Parcel Service',
    trackUrl: 'https://trackingstatus.in/kpn-parcel-service-tracking/',
    mode: 'deeplink',
    note: 'Third-party page, not KPN’s own — the customer pastes the number in.',
  },
  {
    slug: 'surya-parcel',
    name: 'Surya Parcel Service (Sivakasi)',
    trackUrl: 'https://www.track-express.com/surya-express-courier-tracking/',
    mode: 'deeplink',
    note: 'Third-party page, not Surya’s own.',
  },
  { slug: 'vaigai-parcel', name: 'Vaigai Speed Parcel (Sivakasi)', trackUrl: '', mode: 'manual' },

  // — Regional / national road + parcel —
  {
    // Was `track_consignment.aspx` — a 404. The live path is /Tracking/TrackShipment.
    slug: 'vrl-logistics',
    name: 'VRL Logistics',
    trackUrl: 'https://www.vrlgroup.in/Tracking/TrackShipment',
    mode: 'deeplink',
    note: 'Their tracker renders results in the browser, so the server cannot read them.',
  },
  {
    slug: 'tci-express',
    name: 'TCI Express',
    trackUrl: 'https://www.tciexpress.in/trackingdocket.aspx',
    mode: 'deeplink',
  },

  /*
   * — Express couriers —
   *
   * Kept for completeness, but a fireworks shop should almost never pick one.
   * Crackers are Class 1 explosives under the Explosives Act 1884: air
   * shipment is heavily restricted, public transport is not permitted, and
   * PESO licensing applies to carriage. These are air/express networks without
   * explosive carriage, so they will refuse the consignment — which is why
   * Sivakasi ships by licensed lorry lines and hands the customer an LR or GC
   * number rather than an AWB.
   *
   * Their trackers are all behind a paid API key besides, so none can be auto-
   * tracked even where a shop does use one for a non-firework parcel.
   */
  { slug: 'delhivery', name: 'Delhivery', trackUrl: 'https://www.delhivery.com/track/package/{awb}', mode: 'deeplink' },
  { slug: 'dtdc', name: 'DTDC', trackUrl: 'https://www.dtdc.in/tracking.asp', mode: 'deeplink' },
  { slug: 'bluedart', name: 'Blue Dart', trackUrl: 'https://www.bluedart.com/tracking', mode: 'deeplink' },
  {
    slug: 'india-post',
    name: 'India Post',
    trackUrl: 'https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx',
    mode: 'deeplink',
  },
  {
    slug: 'professional-couriers',
    name: 'The Professional Couriers',
    trackUrl: 'https://www.tpcindia.com/Tracking2014.aspx',
    mode: 'deeplink',
  },
  { slug: 'xpressbees', name: 'XpressBees', trackUrl: 'https://www.xpressbees.com/track', mode: 'deeplink' },
  { slug: 'ekart', name: 'Ekart Logistics', trackUrl: 'https://ekartlogistics.com/track', mode: 'deeplink' },
  { slug: 'dhl', name: 'DHL', trackUrl: 'https://www.dhl.com/in-en/home/tracking.html?tracking-id={awb}', mode: 'deeplink' },
  { slug: 'fedex', name: 'FedEx', trackUrl: 'https://www.fedex.com/fedextrack/?trknbr={awb}', mode: 'deeplink' },
];

export function courierDisplayName(slug?: string): string {
  if (!slug) return '';
  return COURIERS.find((c) => c.slug === slug)?.name ?? slug;
}

export function courierOption(slug?: string): CourierOption | undefined {
  return COURIERS.find((c) => c.slug === slug);
}

/** A courier typed in by hand can still be updated by hand, so it reads manual. */
export function trackingModeOf(slug?: string): TrackingMode {
  return courierOption(slug)?.mode ?? 'manual';
}

/**
 * Deep-link to the courier's own tracking page. Returns '' when the courier has
 * no verified online tracking, so callers can hide the "Track on courier site"
 * affordance. `{awb}` in the template is filled with the tracking number.
 */
export function buildTrackingUrl(slug?: string, trackingNumber = ''): string {
  const c = courierOption(slug);
  if (!c || !c.trackUrl) return '';
  return c.trackUrl.replace('{awb}', encodeURIComponent(trackingNumber));
}
