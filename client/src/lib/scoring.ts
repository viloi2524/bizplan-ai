import { calculateEconomics } from './calculator.ts';
import type { CostInputs, Product } from '../types';

export interface ProductScore {
  score: number | null;
  coveragePercent: number;
}

export function calculateProductScore(
  product: Product,
  weights: Record<string, number>,
  costs: CostInputs,
): ProductScore {
  const economics = product.purchasePrice > 0 && product.sellingPrice > 0
    ? calculateEconomics({
      ...costs, purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice,
      quantity: 1, stockPurchased: 1, fixedCost: 0,
    })
    : null;
  const netMargin = economics?.marginPercent;
  const components: Array<{ weight: number; value: number | null }> = [
    {
      weight: Math.max(0, weights.margin ?? 0),
      value: netMargin !== null && netMargin !== undefined
        ? netMargin >= 35 ? 100
          : netMargin >= 20 ? 75
            : netMargin >= 10 ? 40 : 10
        : null,
    },
    {
      weight: Math.max(0, weights.risk ?? 0),
      value: product.risk === 'Rendah' ? 100 : product.risk === 'Sedang' ? 60 : 20,
    },
    { weight: Math.max(0, weights.competition ?? 0), value: null },
    { weight: Math.max(0, weights.capital ?? 0), value: null },
    { weight: Math.max(0, weights.supplier ?? 0), value: null },
  ];
  const configuredWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const available = components.filter((component) => component.value !== null && component.weight > 0);
  const coveredWeight = available.reduce((sum, component) => sum + component.weight, 0);
  if (configuredWeight === 0 || coveredWeight === 0) return { score: null, coveragePercent: 0 };
  const weightedScore = available.reduce((sum, component) => sum + component.value! * component.weight, 0);
  return {
    score: Math.round(weightedScore / coveredWeight),
    coveragePercent: Math.round(coveredWeight / configuredWeight * 100),
  };
}
