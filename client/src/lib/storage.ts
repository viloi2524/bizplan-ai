import type { AppData, CostInputs } from '../types';

export const STORAGE_KEY = 'produklaku-ai-v1';

export const DEFAULT_COST_INPUTS: CostInputs = {
  purchasePrice: 20000,
  sellingPrice: 50000,
  marketplaceFeePercent: 6.5,
  serviceFee: 1000,
  packaging: 2000,
  shippingSubsidy: 1500,
  advertising: 3000,
  operations: 1000,
  returnRatePercent: 2,
  taxPercent: 0,
  quantity: 30,
  stockPurchased: 50,
  fixedCost: 0,
};

export const DEFAULT_DATA: AppData = {
  products: [],
  competitors: [],
  suppliers: [],
  savedReports: [],
  weights: { margin: 30, risk: 25, competition: 20, capital: 15, supplier: 10 },
  costInputs: DEFAULT_COST_INPUTS,
  researchHistory: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false;
  const { products, competitors, suppliers, savedReports, weights, costInputs, researchHistory } = value;
  if (!Array.isArray(products) || !Array.isArray(competitors) || !Array.isArray(suppliers) || !Array.isArray(savedReports)
    || !isRecord(weights) || !isRecord(costInputs) || !Number.isInteger(researchHistory) || !isNonNegative(researchHistory)) return false;

  const numericCostKeys: Array<keyof CostInputs> = [
    'purchasePrice', 'sellingPrice', 'marketplaceFeePercent', 'serviceFee', 'packaging',
    'shippingSubsidy', 'advertising', 'operations', 'returnRatePercent', 'taxPercent',
    'quantity', 'stockPurchased', 'fixedCost',
  ];
  if (!numericCostKeys.every((key) => isNonNegative(costInputs[key]))) return false;
  if ((costInputs.marketplaceFeePercent as number) > 100 || (costInputs.returnRatePercent as number) > 100
    || (costInputs.taxPercent as number) > 100 || !Number.isInteger(costInputs.quantity)
    || !Number.isInteger(costInputs.stockPurchased) || (costInputs.quantity as number) > (costInputs.stockPurchased as number)) return false;
  if (!['margin', 'risk', 'competition', 'capital', 'supplier'].every((key) => isNonNegative(weights[key]))) return false;

  const validText = (entry: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof entry[key] === 'string');
  if (!products.every((entry: unknown) => isRecord(entry)
    && validText(entry, ['id', 'name', 'category', 'marketplace', 'notes', 'createdAt'])
    && ['Rendah', 'Sedang', 'Tinggi'].includes(String(entry.risk))
    && ['purchasePrice', 'sellingPrice', 'weightGrams', 'stockQty'].every((key) => isNonNegative(entry[key]))
    && Number.isInteger(entry.stockQty) && typeof entry.verified === 'boolean')) return false;
  if (!competitors.every((entry: unknown) => isRecord(entry)
    && validText(entry, ['id', 'name', 'strength', 'weakness', 'observedAt', 'source'])
    && isNonNegative(entry.price) && isNonNegative(entry.shipping)
    && (entry.sales === undefined || isNonNegative(entry.sales))
    && (entry.rating === undefined || (isNonNegative(entry.rating) && entry.rating <= 5))
    && (entry.reviews === undefined || isNonNegative(entry.reviews)))) return false;
  if (!suppliers.every((entry: unknown) => isRecord(entry)
    && validText(entry, ['id', 'name', 'product', 'location', 'terms', 'quality', 'updatedAt'])
    && isNonNegative(entry.unitPrice) && isNonNegative(entry.shipping)
    && Number.isInteger(entry.moq) && (entry.moq as number) >= 1
    && Number.isInteger(entry.leadDays) && isNonNegative(entry.leadDays))) return false;
  return savedReports.every((entry: unknown) => isRecord(entry)
    && validText(entry, ['id', 'title', 'body', 'createdAt']));
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    const data: Partial<AppData> = JSON.parse(raw) as Partial<AppData>;
    const normalized: AppData = {
      ...DEFAULT_DATA,
      ...data,
      products: data.products ?? [],
      competitors: data.competitors ?? [],
      suppliers: data.suppliers ?? [],
      savedReports: data.savedReports ?? [],
      costInputs: { ...DEFAULT_COST_INPUTS, ...data.costInputs },
      weights: { ...DEFAULT_DATA.weights, ...data.weights },
    };
    if (!isAppData(normalized)) throw new Error('Data tersimpan tidak sesuai skema ProdukLaku AI.');
    return normalized;
  } catch (error) {
    console.error('Gagal membaca data ProdukLaku dari penyimpanan lokal.', error);
    return DEFAULT_DATA;
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Gagal menyimpan data ProdukLaku ke penyimpanan lokal.', error);
    return false;
  }
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}
