import { DemandCard, Mode, ShockType, Tier, TierValues } from './types'

export const ROUND2_CONFIG = {
  playerCount: 5,
  rounds: 5,
  basePlots: 2,
  coopOrganicPlots: 1,
  yieldPerPlot: 1,
  startingCash: 18,
  conventionalCostPerRound: 2,
  organicCostPerRound: 6,
  contractPrice: 4,
  contractShortfallPenalty: 4,
  shockFundCost: 2,
  shockFundPayout: 4,
  // Playtest signals: warnings can miss a shock or be a false alarm.
  forecastHitChance: 0.7,
  forecastFalseAlarmChance: 0.35,
  floodLossFraction: 0.5,
  prices: {
    conventional: { affordable: 2, standard: 4, premium: 6 },
    organic: { affordable: 3, standard: 5, premium: 7 },
  } satisfies Record<Mode, TierValues>,
  shockDeck: ['flood', 'marketClosure', 'tourismCollapse'] as ShockType[],
}

const tier = (affordable: number, standard: number, premium: number): TierValues => ({ affordable, standard, premium })
const card = (
  id: string,
  label: string,
  conventionalLocal: TierValues,
  organicLocal: TierValues,
  organicTourist: TierValues,
): DemandCard => ({
  id,
  label,
  demand: {
    conventional: { local: conventionalLocal, tourist: tier(0, 0, 0) },
    organic: { local: organicLocal, tourist: organicTourist },
  },
})

// Values are preliminary playtest data. Local organic demand is deliberately lower-priced;
// tourist demand creates the Standard/Premium organic opportunity.
export const ROUND2_DEMAND_DECK: DemandCard[] = [
  card('neighbourhood', 'Neighbourhood week', tier(5, 3, 0), tier(3, 1, 0), tier(0, 2, 1)),
  card('tourist-weekend', 'Tourist weekend', tier(3, 3, 0), tier(2, 1, 0), tier(0, 3, 3)),
  card('local-festival', 'Local festival', tier(6, 3, 0), tier(4, 1, 0), tier(0, 2, 2)),
  card('quiet-market', 'Quiet market', tier(3, 2, 0), tier(2, 1, 0), tier(0, 1, 1)),
  card('premium-week', 'Premium week', tier(3, 4, 0), tier(2, 2, 0), tier(0, 3, 4)),
]
