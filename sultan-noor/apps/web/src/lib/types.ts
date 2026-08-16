export interface AuthUser {
  id: string;
  phone: string;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | "WAREHOUSE_MANAGER" | "B2B_CUSTOMER" | "CUSTOMER";
  customerType: "RETAIL" | "WHOLESALE";
}

export interface ProductImage {
  id: string;
  url: string;
  altText?: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: Category[];
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  basePrice: string;
  compareAtPrice?: string | null;
  minWholesaleQty?: number | null;
  brand?: Brand | null;
  category?: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
  avgRating?: number | null;
  reviewCount?: number;
  totalStock?: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productVariantId?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: Product;
  productVariant?: ProductVariant | null;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  grandTotal: string;
  createdAt: string;
  items: { id: string; nameSnapshot: string; quantity: number; unitPrice: string; lineTotal: string }[];
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  author?: { fullName: string | null };
}

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  placement: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string | null;
  isActive: boolean;
}

export interface StockLevel {
  id: string;
  quantity: number;
  reservedQuantity: number;
  productVariant: {
    id: string;
    sku: string;
    product: { id: string; name: string };
  };
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
}

export interface CustomerGroup {
  id: string;
  name: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  minOrderTotal?: string | null;
  maxUsage?: number | null;
  maxUsagePerUser?: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export interface ShippingRate {
  id: string;
  province: string | null;
  maxWeightGrams: number;
  price: string;
}

export interface PriceTier {
  id: string;
  productId: string;
  customerGroupId: string;
  minQuantity: number;
  unitPrice: string;
  customerGroup?: CustomerGroup;
}

export interface PendingReview {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user: { fullName: string | null; phone: string };
  images: { id: string; url: string }[];
}

export interface AdminQuestion {
  id: string;
  body: string;
  isPublished: boolean;
  isAnswered: boolean;
  createdAt: string;
  product: { id: string; name: string; slug: string };
  user: { fullName: string | null; phone: string };
  answers: { id: string; body: string; isFromStaff: boolean; createdAt: string }[];
}

export interface AdminUser {
  id: string;
  phone: string;
  fullName?: string | null;
  role: AuthUser["role"];
  customerType: "RETAIL" | "WHOLESALE";
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  user?: { fullName: string | null; phone: string } | null;
}
