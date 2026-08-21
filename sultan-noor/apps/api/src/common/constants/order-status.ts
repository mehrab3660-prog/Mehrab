import { OrderStatus } from '@prisma/client';

// Orders that actually represent real, counted sales — excludes carts that
// never paid (PENDING_PAYMENT) and orders that didn't ultimately happen
// (CANCELLED/REFUNDED). Every revenue figure across the app is scoped to
// these statuses so nothing fabricated or reversed inflates the numbers.
// Kept in its own file (not exported from DashboardService) so services
// that need it never form a circular import with dashboard.service.ts.
export const REAL_SALE_STATUSES: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'DELIVERED'];
