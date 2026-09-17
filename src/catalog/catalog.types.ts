export type TextInput = string;
export type ImageInput = {
  url: string;
  publicId?: string;
  alt?: TextInput;
};

export type ProductInput = {
  id?: string;
  slug: string;
  sku: string;
  name: TextInput;
  description: TextInput;
  category: { slug: string; name: TextInput };
  badge?: TextInput;
  images: (string | ImageInput)[];
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  purchaseCost?: number;
  packagingCost?: number;
  rating?: number | null;
  reviewCount?: number;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  featured?: boolean;
  journeySlugs?: string[];
  details?: {
    includedItems?: { id?: string; name: TextInput; image?: string }[];
    whyEssential?: TextInput[];
    preferredFor?: TextInput[];
  };
  attributes?: {
    name: TextInput;
    values: { value: TextInput; colorHex?: string }[];
  }[];
  variants?: {
    id?: string;
    sku: string;
    price?: number | null;
    compareAtPrice?: number | null;
    stock: number;
    purchaseCost?: number;
    packagingCost?: number;
    imageUrl?: string | null;
    isActive?: boolean;
    selections: { attribute: string; value: string }[];
  }[];
};

export type ComboInput = {
  id?: string;
  slug: string;
  sku: string;
  name: TextInput;
  subtitle: TextInput;
  description: TextInput;
  images: (string | ImageInput)[];
  items: { productId: string; quantity: number; variant?: TextInput }[];
  price: number;
  compareAtPrice: number;
  stock: number;
  packagingCost?: number;
  rating?: number | null;
  reviewCount?: number;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  journeyStage: TextInput;
  whyThisBox?: TextInput[];
  preferredFor?: TextInput[];
  usageGuide?: {
    id?: string;
    title: TextInput;
    description: TextInput;
  }[];
  selectionReasons?: TextInput[];
  packaging?: TextInput[];
  reviews?: {
    id?: string;
    customerName: string;
    rating: number;
    review: TextInput;
  }[];
  faqs?: { id?: string; question: TextInput; answer: TextInput }[];
};

export type BannerInput = {
  id?: string;
  key: string;
  placement: 'HOME_HERO' | 'SHOP_HERO' | 'GUIDE_HERO' | 'SOLUTION_GUIDE';
  desktopImage: string;
  mobileImage?: string | null;
  publicId?: string | null;
  mobilePublicId?: string | null;
  eyebrow?: TextInput;
  title?: TextInput;
  description?: TextInput;
  buttonLabel?: TextInput;
  link?: string | null;
  tone?: string | null;
  isPublished?: boolean;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type BannerPublicationInput = {
  isPublished: boolean;
};
