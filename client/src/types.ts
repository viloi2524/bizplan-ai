export type RiskLevel = 'Rendah' | 'Sedang' | 'Tinggi';

export interface Product {
  id: string;
  name: string;
  category: string;
  marketplace: string;
  purchasePrice: number;
  sellingPrice: number;
  weightGrams: number;
  stockQty: number;
  risk: RiskLevel;
  notes: string;
  verified: boolean;
  createdAt: string;
}

export interface Competitor {
  id: string;
  name: string;
  price: number;
  shipping: number;
  sales?: number;
  rating?: number;
  reviews?: number;
  strength: string;
  weakness: string;
  observedAt: string;
  source: string;
}

export interface Supplier {
  id: string;
  name: string;
  product: string;
  unitPrice: number;
  moq: number;
  shipping: number;
  leadDays: number;
  location: string;
  terms: string;
  quality: string;
  updatedAt: string;
}

export interface CostInputs {
  purchasePrice: number;
  sellingPrice: number;
  marketplaceFeePercent: number;
  serviceFee: number;
  packaging: number;
  shippingSubsidy: number;
  advertising: number;
  operations: number;
  returnRatePercent: number;
  taxPercent: number;
  quantity: number;
  stockPurchased: number;
  fixedCost: number;
}

export interface AppData {
  products: Product[];
  competitors: Competitor[];
  suppliers: Supplier[];
  savedReports: Array<{ id: string; title: string; body: string; createdAt: string }>;
  weights: {
    margin: number;
    risk: number;
    competition: number;
    capital: number;
    supplier: number;
  };
  costInputs: CostInputs;
  researchHistory: number;
}
