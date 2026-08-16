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
