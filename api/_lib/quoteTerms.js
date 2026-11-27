// Server copy of src/utils/quoteTerms.js (api/ functions aren't bundled by Vite).
// Keep the two files identical below this line; api/_lib/pricingCopies.test.js checks.
// Standard quote terms (CRM Phase 2, docs/QUOTES.md).
// From Dylan's Goodshuffle contract (balance due wording: "7 days", Dylan
// 2026-11-26). Editable in Settings > Prices > Quote terms.
export const DEFAULT_TERMS = [
  'Total price includes delivery, set-up, and take-down of gaming tables.',
  'Gratuity is not included in the total and is at your discretion. All tips go to the dealers at your event.',
  'Price reflects a 3-hour playtime. Additional time added during the event is $80 per dealer per hour, tax included, paid at the end of the event. Added before the event, it is $75 per dealer per hour plus tax.',
  'Chairs need to be provided for gaming tables.',
  'If more than 25 chips are missing at the end of the night, there is a charge of $0.26 per chip.',
  'Tables are property of Vegas on Wheels and are provided for amusement purposes only. Any loss, damage, or confiscation of tables becomes the responsibility of the client. Confiscation only applies to table rentals without dealers.',
  'Events that require setup more than 3 hours before the scheduled setup time are subject to additional fees.',
  'Dealers break down immediately after the contracted time and tables are removed at that time. Keeping tables in place until the end of your event is an additional $350.',
  'Once the contract is signed, tables cannot be reduced, but can be added if equipment and staff are available.',
  'If the event is canceled due to a public health emergency issued by the Wisconsin Department of Health Services, you have one year to re-book with a $350 re-book fee.',
  'You give Vegas on Wheels permission to take photos during the event and post them to our social media.',
  'Payment: a 50% deposit is required to confirm the booking. The remaining balance is due 7 days before the event. Initial payments are non-refundable. Additional payment processing fees may apply.',
  'Cancellation: 60 days or less before the event, 100% of the total contract amount is due, and any initial payment will not be refunded.'
].join('\n');

export const QUOTE_SETTINGS_KEY = 'quote_settings';
