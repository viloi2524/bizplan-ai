import type { CostInputs } from '../types';

export interface UnitEconomics {
  marketplaceFee: number;
  returnAllowance: number;
  taxAmount: number;
  variableCostPerUnit: number;
  totalCostPerUnit: number;
  contributionPerUnit: number;
  profitPerUnit: number;
  revenue: number;
  totalProfit: number;
  marginPercent: number | null;
  roiPercent: number | null;
  investedCapital: number;
  breakEvenUnits: number | null;
}

const finiteNonNegative = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} harus berupa angka nol atau lebih.`);
  }
  return value;
};

export function calculateEconomics(input: CostInputs): UnitEconomics {
  const price = finiteNonNegative(input.sellingPrice, 'Harga jual');
  const cogs = finiteNonNegative(input.purchasePrice, 'Harga beli');
  const quantity = finiteNonNegative(input.quantity, 'Jumlah terjual');
  const stock = finiteNonNegative(input.stockPurchased, 'Jumlah stok');
  const fixed = finiteNonNegative(input.fixedCost, 'Biaya tetap');
  const feePercent = finiteNonNegative(input.marketplaceFeePercent, 'Persentase biaya marketplace');
  const returnPercent = finiteNonNegative(input.returnRatePercent, 'Persentase retur');
  const taxPercent = finiteNonNegative(input.taxPercent, 'Persentase pajak');
  const serviceFee = finiteNonNegative(input.serviceFee, 'Biaya layanan');
  const packaging = finiteNonNegative(input.packaging, 'Biaya kemasan');
  const shippingSubsidy = finiteNonNegative(input.shippingSubsidy, 'Subsidi ongkir');
  const advertising = finiteNonNegative(input.advertising, 'Biaya iklan');
  const operations = finiteNonNegative(input.operations, 'Biaya operasional');
  if (!Number.isInteger(quantity) || !Number.isInteger(stock)) {
    throw new RangeError('Jumlah unit harus berupa bilangan bulat.');
  }
  if (feePercent > 100 || returnPercent > 100 || taxPercent > 100) {
    throw new RangeError('Persentase biaya tidak boleh melebihi 100%.');
  }
  if (quantity > stock) {
    throw new RangeError('Jumlah terjual tidak boleh melebihi stok yang dibeli.');
  }
  const marketplaceFee = price * feePercent / 100 + serviceFee;
  const returnAllowance = (cogs + packaging) * returnPercent / 100;
  const taxAmount = price * taxPercent / 100;
  const variableCostPerUnit = marketplaceFee + packaging + shippingSubsidy
    + advertising + operations + returnAllowance + taxAmount;
  const totalCostPerUnit = cogs + variableCostPerUnit;
  const contributionPerUnit = price - totalCostPerUnit;
  const profitPerUnit = contributionPerUnit;
  const revenue = price * quantity;
  const totalProfit = revenue - totalCostPerUnit * quantity - fixed;
  const investedCapital = cogs * stock + variableCostPerUnit * quantity + fixed;
  const breakEvenUnits = contributionPerUnit > 0 ? Math.ceil(fixed / contributionPerUnit) : null;

  return {
    marketplaceFee: Math.round(marketplaceFee),
    returnAllowance: Math.round(returnAllowance),
    taxAmount: Math.round(taxAmount),
    variableCostPerUnit: Math.round(variableCostPerUnit),
    totalCostPerUnit: Math.round(totalCostPerUnit),
    contributionPerUnit: Math.round(contributionPerUnit),
    profitPerUnit: Math.round(profitPerUnit),
    revenue: Math.round(revenue),
    totalProfit: Math.round(totalProfit),
    marginPercent: price > 0 ? Number((totalProfit / revenue * 100).toFixed(2)) : null,
    roiPercent: investedCapital > 0 ? Number((totalProfit / investedCapital * 100).toFixed(2)) : null,
    investedCapital: Math.round(investedCapital),
    breakEvenUnits,
  };
}

export function calculateSupplierLandedCost(supplier: {
  unitPrice: number;
  moq: number;
  shipping: number;
}, plannedUnits: number): { quantity: number; totalCost: number; unitLandedCost: number } {
  if (![supplier.unitPrice, supplier.moq, supplier.shipping, plannedUnits].every(Number.isFinite)
    || supplier.unitPrice < 0 || supplier.moq < 1 || !Number.isInteger(supplier.moq)
    || supplier.shipping < 0 || plannedUnits < 1 || !Number.isInteger(plannedUnits)) {
    throw new RangeError('Harga, MOQ, ongkir, dan jumlah pembelian harus valid.');
  }
  const quantity = Math.max(Math.ceil(plannedUnits), Math.ceil(supplier.moq));
  const totalCost = supplier.unitPrice * quantity + supplier.shipping;
  return { quantity, totalCost, unitLandedCost: totalCost / quantity };
}
