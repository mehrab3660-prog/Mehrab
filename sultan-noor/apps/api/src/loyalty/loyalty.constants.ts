// Shared by OrdersService (earning/redeeming/reversing points on an order)
// and LoyaltyService (reporting balance/history) so the two rates can never
// drift apart. 1 point earned per 20,000 toman actually paid, each point
// worth 1,000 toman when redeemed — a flat 5% reward rate in both
// directions, so there's no confusing double conversion for customers.
export const LOYALTY_EARN_DIVISOR_TOMAN = 20_000;
export const LOYALTY_POINT_VALUE_TOMAN = 1_000;

// A customer can never cover more than half an order's subtotal with
// points — keeps at least some real payment on every order.
export const LOYALTY_MAX_REDEMPTION_RATIO = 0.5;

// Referral program: both sides of a referral get this many points, paid
// out once the referred friend's first order is actually delivered.
export const REFERRAL_BONUS_POINTS = 50;
