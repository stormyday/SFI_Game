import { Crop, DemandCard, ProductionMode, ShockType, Tier } from './types'

export const GAME_CONFIG = {
  playerCount: 5,
  rounds: 5,
  independentCapacity: 2,
  coopCapacity: 3,
  yieldPerPlot: 2,
  startingCash: 12,
  organicUpkeep: 2,
  contractQuantity: 2,
  contractPrice: 7,
  contractShortfallPenalty: 4,
  touristPriceBonus: 1,
  floodLossFraction: 0.5,
  prices: {
    conventional: { affordable: 2, standard: 4, premium: 6 },
    organic: { affordable: 3, standard: 5, premium: 7 },
  } satisfies Record<ProductionMode, Record<Tier, number>>,
  crops: ['rice', 'vegetables'] as Crop[],
  shockDeck: ['flood', 'marketClosure', 'tourismCollapse'] as ShockType[],
}

const card = (
  id: string,
  label: string,
  rice: number[],
  vegetables: number[],
  touristRice: number[],
  touristVegetables: number[],
): DemandCard => {
  const pools = (v: number[]) => ({
    conventional: { affordable: v[0], standard: v[1], premium: v[2] },
    organic: { affordable: v[3], standard: v[4], premium: v[5] },
  })
  const tourist = (v: number[]) => ({ affordable: v[0], standard: v[1], premium: v[2] })
  return {
    id,
    label,
    local: { rice: pools(rice), vegetables: pools(vegetables) },
    tourist: { rice: tourist(touristRice), vegetables: tourist(touristVegetables) },
  }
}

// These are intentionally compact, editable scenario cards—not a claim of real market data.
export const DEMAND_DECK: DemandCard[] = [
  card('neighbourhood', 'Neighbourhood staples', [4, 2, 1, 3, 2, 0], [2, 3, 1, 2, 2, 1], [1, 1, 0], [1, 1, 0]),
  card('tourist-weekend', 'Tourist weekend', [2, 2, 1, 2, 3, 2], [1, 2, 1, 2, 3, 2], [1, 2, 2], [1, 2, 2]),
  card('local-festival', 'Local festival', [3, 3, 2, 2, 2, 1], [3, 2, 1, 2, 2, 1], [2, 2, 1], [2, 1, 1]),
  card('quiet-market', 'Quiet market', [3, 1, 0, 2, 1, 0], [2, 2, 0, 1, 1, 0], [0, 1, 0], [0, 1, 0]),
  card('premium-week', 'Premium demand', [1, 2, 2, 2, 2, 2], [1, 2, 2, 2, 2, 2], [1, 2, 3], [1, 2, 3]),
]
