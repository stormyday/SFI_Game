export const TIERS = ['affordable', 'standard', 'premium'] as const
export const MODES = ['conventional', 'organic'] as const
export const SOURCES = ['local', 'tourist'] as const
export const ROLES = ['Community Anchor', 'Organic Pioneer', 'Independent', 'Institution Builder'] as const

export type Tier = typeof TIERS[number]
export type Mode = typeof MODES[number]
export type Source = typeof SOURCES[number]
export type Role = typeof ROLES[number]
export type FarmStatus = 'conventional' | 'converting' | 'organic'
export type Phase = 'planning' | 'confirming' | 'voting' | 'resolution' | 'debrief'
export type ShockType = 'flood' | 'marketClosure' | 'tourismCollapse'
export type PlotState = 'growing-conventional' | 'growing-organic' | 'converting' | 'crisis-affected' | 'empty'
export type TierValues = Record<Tier, number>
export type SourceDemand = Record<Source, TierValues>
export type MarketDemand = Record<Mode, SourceDemand>

export interface Harvest {
  mode: Mode
  units: number
  plantedRound: number
}

export interface Contract {
  id: string
  quantity: number
  dueRound: number
  pricePerUnit: number
  signedRound: number
}

export interface LandPlot {
  id: 'base-1' | 'base-2' | 'coop-1'
  kind: 'base' | 'coop'
  state: PlotState
}

export interface TurnPlan {
  saleTier: Tier | null
  joinCoop: boolean
  startConversion: boolean
  contractQuantity: number | null
}

export interface PlayerMetrics {
  affordableLocalSales: number
  touristSales: number
  organicUnitsSold: number
  contractsSigned: number
  contractsFulfilled: number
  totalSpoilage: number
}

export interface Player {
  id: string
  name: string
  role: Role
  cash: number
  startingCash: number
  coop: boolean
  farmStatus: FarmStatus
  conversionStartedRound: number | null
  land: LandPlot[]
  harvest: Harvest | null
  growingHarvest: Harvest | null
  contracts: Contract[]
  metrics: PlayerMetrics
}

export interface DemandCard {
  id: string
  label: string
  demand: MarketDemand
}

export interface MarketSnapshot {
  mode: Mode
  demand: SourceDemand
  supplyByTier: TierValues
  soldByTier: TierValues
}

export interface ResolutionLine {
  playerId: string
  contractUnits: number
  contractShortfall: number
  localUnits: number
  touristUnits: number
  affordableLocalUnits: number
  organicUnitsSold: number
  marketUnits: number
  spoilage: number
  revenue: number
  costs: number
}

export interface CrisisPlayerImpact {
  playerId: string
  growingCropsLost: number
  openMarketBlocked: number
}

export interface CrisisImpact {
  shock: ShockType
  headline: string
  playerImpacts: CrisisPlayerImpact[]
  touristDemandRemoved: number
}

export interface Resolution {
  round: number
  demand: DemandCard | null
  shock: ShockType | null
  crisisImpact: CrisisImpact | null
  markets: MarketSnapshot[]
  lines: ResolutionLine[]
  note: string
}

export interface GameState {
  round: number
  phase: Phase
  players: Player[]
  plans: Record<string, TurnPlan>
  locked: string[]
  activePlayerIndex: number
  votePlayerIds: string[]
  votes: Record<string, Tier>
  demandDeck: DemandCard[]
  shockRound: number
  shock: ShockType
  resolution: Resolution | null
}
