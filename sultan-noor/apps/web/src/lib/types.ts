export interface AuthUser {
  id: string;
  phone: string;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | "WAREHOUSE_MANAGER" | "B2B_CUSTOMER" | "CUSTOMER";
  customerType: "RETAIL" | "WHOLESALE";
}

export interface AiMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "STAFF";
  content: string;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  escalatedAt?: string | null;
  resolvedAt?: string | null;
  messages: AiMessage[];
  user?: { id: string; fullName: string | null; phone: string } | null;
}

// The only product shape the Store-only AI Product Seller ever returns —
// always built server-side from a real, current Catalog lookup, never from
// parsed LLM text (Sprint 6).
export interface AiProductCard {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  price: number;
  inStock: boolean;
  stock: number;
  imageUrl: string | null;
  avgRating: number | null;
  reviewCount: number;
}

export interface AiAskResponse {
  conversationId: string;
  reply: string | null;
  suggestedProducts: AiProductCard[];
  relatedProducts?: AiProductCard[];
  awaitingStaff: boolean;
  allowAddToCart?: boolean;
}

export type NewsItemStatus = "DISCOVERED" | "VERIFIED" | "AI_DRAFT" | "PENDING_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED";

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewsFaqItem {
  q: string;
  a: string;
}

export interface NewsItem {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  rawTitle: string;
  rawSummary: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  status: NewsItemStatus;
  duplicateOfId: string | null;
  similarGroupKey: string | null;
  confidenceNote: string | null;
  draftTitle: string | null;
  draftExcerpt: string | null;
  draftBody: string | null;
  category: string | null;
  tags: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  keywords: string | null;
  faq: NewsFaqItem[] | null;
  confirmingSources: string[] | null;
  suggestedImagePrompt: string | null;
  imageUrl: string | null;
  imageSource: "SOURCE" | "SOURCE_SEARCH" | "AI_GENERATED" | null;
  imageIsAiGenerated: boolean;
  imageAttribution: string | null;
  publishedBlogPostId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConsultationStatus = "COLLECTING_INFO" | "READY" | "CART_ADDED";
export type ConsultantTier = "ECONOMIC" | "STANDARD" | "PROFESSIONAL";

export interface ElectricalConsultation {
  id: string;
  userId: string | null;
  status: ConsultationStatus;
  areaSqm: number | null;
  bedrooms: number | null;
  livingRooms: number | null;
  kitchens: number | null;
  bathrooms: number | null;
  otherRooms: number | null;
  hasStaircase: boolean | null;
  buildingType: string | null;
  preferencesText: string | null;
  preferredBrandId: string | null;
  cheapestOnly: boolean;
  higherQuality: boolean;
  selectedTier: ConsultantTier | null;
  cartAddedAt: string | null;
  packagesJson?: ConsultantPackages | null;
  noMatchItemKeysJson?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

// Every field here is always built server-side from a real, currently
// hydrated Catalog product — the same structural guarantee as the
// Store-only AI Product Seller's product cards (Sprint 6).
export interface ConsultantPackageLine {
  itemKey: string;
  label: string;
  productId: string;
  productName: string;
  slug: string;
  brandName: string | null;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reason: string;
  requestedQuantity: number;
}

export type ConsultantPackages = Partial<Record<ConsultantTier, { lines: ConsultantPackageLine[]; total: number }>>;

export interface ConsultationStepResponse {
  consultation: ElectricalConsultation;
  missingFields: string[];
  nextQuestion: string | null;
  readyToGenerate: boolean;
  requestedBrandName?: string | null;
  brandRecognized?: boolean;
}

export interface GeneratePackagesResponse {
  consultation: ElectricalConsultation;
  packages: ConsultantPackages;
  noMatchItemKeys: string[];
  safetyDisclaimer: string;
}

export interface ConsultantItemRule {
  id: string;
  itemKey: string;
  label: string;
  categoryId: string | null;
  keywords: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  priorityBrandIds: string | null;
  allowedProductIdsJson: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  supplierId?: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  avgRating?: number | null;
  reviewCount?: number;
  totalStock?: number;
  restockSubscribed?: boolean;
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
  deliveryDate?: string | null;
  deliverySlot?: "MORNING" | "AFTERNOON" | "EVENING" | null;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: string;
  loyaltyPointsEarned?: number;
  items: { id: string; nameSnapshot: string; quantity: number; unitPrice: string; lineTotal: string }[];
}

export interface LoyaltyTransaction {
  id: string;
  type: "EARNED" | "REDEEMED" | "ADJUSTED" | "REFERRAL_BONUS";
  points: number;
  balanceAfter: number;
  note?: string | null;
  orderId?: string | null;
  createdAt: string;
}

export interface LoyaltySummary {
  balance: number;
  pointValueToman: number;
  earnDivisorToman: number;
  maxRedemptionRatio: number;
  transactions: LoyaltyTransaction[];
  referralCode: string | null;
  referralBonusPoints: number;
  referralCount: number;
  referralRewardedCount: number;
}

export interface WholesaleLead {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email?: string | null;
  message: string;
  status: "NEW" | "CONTACTED" | "CONVERTED" | "CLOSED";
  adminNote?: string | null;
  createdAt: string;
}

export interface ReturnRequest {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED";
  adminNote?: string | null;
  createdAt: string;
  order: { orderNumber: string };
  user: { fullName: string | null; phone: string };
  items: { id: string; quantity: number; orderItem: { nameSnapshot: string; skuSnapshot?: string | null } }[];
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

export interface ProductAiDraft {
  id: string;
  name: string;
  brandName?: string | null;
  modelNumber?: string | null;
  ownerPrice: string;
  suggestedPrice?: string | null;
  description?: string | null;
  specs?: Record<string, string> | null;
  features?: string[] | null;
  faq?: { q: string; a: string }[] | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  categoryName?: string | null;
  confidenceNote?: string | null;
  sources?: string[] | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
  publishedProductId?: string | null;
  imageAutopilotNote?: string | null;
  images?: ProductAiDraftImage[];
  createdAt: string;
}

export interface ProductAiDraftImage {
  id: string;
  draftId: string;
  imageType: "REAL_SOURCE" | "PROCESSED_REAL" | "AI_GENERATED" | "ADMIN_UPLOADED";
  status: "CANDIDATE" | "APPROVED" | "REJECTED";
  isMain: boolean;
  role?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  webpUrl?: string | null;
  avifUrl?: string | null;
  sourceUrl?: string | null;
  sourceProvider?: string | null;
  attribution?: string | null;
  isOfficialSource: boolean;
  width?: number | null;
  height?: number | null;
  fileSizeBytes?: number | null;
  format?: string | null;
  relevanceScore?: number | null;
  rejectionReason?: string | null;
  aiProvider?: string | null;
  aiPromptVersion?: string | null;
  aiPrompt?: string | null;
  generatedAt?: string | null;
  createdAt: string;
}

export interface SeoProblem {
  severity: "HIGH" | "MEDIUM" | "LOW";
  entityType: "Product" | "Category" | "BlogPost";
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}

export interface ProductSeoSuggestion {
  id: string;
  productId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  searchKeywords?: string | null;
  h1Suggestion?: string | null;
  descriptionSuggestion?: string | null;
  faq?: { q: string; a: string }[] | null;
  altTextSuggestions?: Record<string, string> | null;
  internalLinks?: { label: string; url: string }[] | null;
  sources?: string[] | null;
  confidenceNote?: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
  appliedFields?: string[] | null;
  createdAt: string;
}

export type ContentDraftType = "BLOG_POST" | "BUYING_GUIDE" | "COMPARISON" | "FAQ" | "EDUCATIONAL_ARTICLE" | "PRODUCT_INTRO" | "CATEGORY_CONTENT";

export interface ContentDraft {
  id: string;
  type: ContentDraftType;
  topic: string;
  keywords?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  faq?: { q: string; a: string }[] | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  suggestedImagePrompt?: string | null;
  internalLinks?: { label: string; url: string }[] | null;
  sources?: string[] | null;
  productId?: string | null;
  categoryId?: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  rejectionReason?: string | null;
  publishedBlogPostId?: string | null;
  createdAt: string;
}

export interface AiControlCenterData {
  pendingDraftsCount: number;
  pendingDrafts: { id: string; name: string; createdAt: string }[];
  draftsNeedingAttention: { id: string; name: string; imageAutopilotNote: string | null; createdAt: string }[];
  unansweredQuestions: { id: string; body: string; createdAt: string; product: { id: string; name: string; slug: string } }[];
  lowStockVariants: { quantity: number; sku: string; productId: string; productName: string }[];
  recentAiActivity: { action: string; entityType: string; entityId?: string | null; createdAt: string; user?: { fullName: string | null; phone: string } | null }[];
  seoProblemsCount: number;
  seoProblemsBySeverity: { HIGH: number; MEDIUM: number; LOW: number };
  seoProblemsSample: SeoProblem[];
  pendingSeoSuggestions: { id: string; productId: string; productName: string; createdAt: string }[];
  pendingContentDrafts: { id: string; type: ContentDraftType; topic: string; title: string | null; createdAt: string }[];
  productsNeedingSeoCount: number;
  aiUsageCostThisMonthToman: number;
  salesToday: { revenue: number; orderCount: number; averageOrderValue: number };
  salesThisMonth: { revenue: number; orderCount: number; averageOrderValue: number };
  bestSellers: { productId: string; name: string; quantitySold: number; revenue: number }[];
  worstSellers: { productId: string; name: string; quantitySold: number; revenue: number }[];
  criticalStockOpportunities: { productId: string; name: string; quantitySold: number; stockRemaining: number }[];
  crossSellOpportunityCount: number;
  bundleOpportunityCount: number;
  abandonedCarts: { count: number; approximateValueToman: number };
  pendingSalesRecommendations: { id: string; type: SalesRecommendationType; title: string; severity: SalesRecommendationSeverity; createdAt: string }[];
  salesDataGaps: string[];
  news: {
    pendingReviewCount: number;
    pendingReview: { id: string; draftTitle: string | null; rawTitle: string; category: string | null; createdAt: string }[];
    discoveredCount: number;
    publishedCount: number;
    aiCostThisMonthToman: number;
    aiErrorsThisMonth: number;
  };
  storeAi: {
    productQueriesThisMonth: number;
    searchSuccessThisMonth: number;
    noResultSearchesThisMonth: number;
    addToCartThisMonth: number;
    aiCostThisMonthToman: number;
    aiErrorsThisMonth: number;
    conversion: { trackableClicks: number; converted: number; rate: number } | null;
  };
  consultant: {
    consultationsStartedThisMonth: number;
    consultationsCompletedThisMonth: number;
    packagesGeneratedThisMonth: number;
    addToCartThisMonth: number;
    noMatchRequestsThisMonth: number;
    mostSuggestedProducts: { productId: string; name: string; count: number }[];
    conversion: { trackableClicks: number; converted: number; rate: number } | null;
  };
}

export type SalesRecommendationType = "CROSS_SELL" | "BUNDLE" | "DISCOUNT" | "CAMPAIGN" | "ABANDONED_CART";
export type SalesRecommendationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface SalesRecommendation {
  id: string;
  type: SalesRecommendationType;
  severity: SalesRecommendationSeverity;
  title: string;
  reason: string;
  supportingData?: Record<string, unknown> | null;
  productIds?: string[] | null;
  payload?: Record<string, unknown> | null;
  confidenceNote?: string | null;
  sources?: string[] | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ACTIVE";
  rejectionReason?: string | null;
  createdAt: string;
}

export interface SalesAnalyticsOverview {
  today: { revenue: number; orderCount: number; averageOrderValue: number };
  thisMonth: { revenue: number; orderCount: number; averageOrderValue: number };
  window: { days: number; revenue: number; orderCount: number; averageOrderValue: number };
  bestSellersByRevenue: { productId: string; name: string; quantitySold: number; revenue: number }[];
  bestSellersByQuantity: { productId: string; name: string; quantitySold: number; revenue: number }[];
  worstSellers: { productId: string; name: string; quantitySold: number; revenue: number }[];
  noSalesProducts: { productId: string; name: string; publishedAt: string }[];
  decliningSalesProducts: { productId: string; name: string; currentQty: number; priorQty: number; declinePercent: number }[];
  revenueByDay: { period: string; total: number }[];
  dataGaps: string[];
}

export interface CrossSellPair {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  coOccurrence: number;
}

export interface AbandonedCartSummary {
  count: number;
  approximateValueToman: number;
  frequentProducts: { productId: string; name: string; count: number }[];
  oldestAbandonedAt: string | null;
  carts: { id: string; abandonedAt: string; itemCount: number; reminderAlreadySent: boolean }[];
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
