export const CROPS = ['rice', 'vegetables'] as const
export const TIERS = ['affordable', 'standard', 'premium'] as const
export const MODES = ['conventional', 'organic'] as const
export const ROLES = ['Community Anchor', 'Organic Pioneer', 'Independent', 'Institution Builder'] as const

export type Crop = typeof CROPS[number]
export type Tier = typeof TIERS[number]
export type ProductionMode = typeof MODES[number]
export type Role = typeof ROLES[number]
export type FarmStatus = 'conventional' | 'converting' | 'organic'
export type Phase = 'planning' | 'confirming' | 'voting' | 'resolution' | 'debrief'
export type ShockType = 'flood' | 'marketClosure' | 'tourismCollapse'

export type CropRecord<T> = Record<Crop, T>
export type TierRecord<T> = Record<Tier, T>
export type PriceChoices = CropRecord<Tier>

export interface Plan {
  allocation: CropRecord<number>
  prices: PriceChoices
  joinCoop: boolean
  startOrganic: boolean
  revertOrganic: boolean
  contractCrop: Crop | null
}

export interface Contract {
  crop: Crop
  quantity: number
  dueRound: number
  pricePerUnit: number
}

export interface HarvestBatch {
  crop: Crop
  quantity: number
  mode: ProductionMode
  tier: Tier
  plantedRound: number
}

export interface PlayerMetrics {
  affordableLocalSales: number
  touristSales: number
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
  activeContract: Contract | null
  harvests: HarvestBatch[]
  metrics: PlayerMetrics
}

export interface DemandCard {
  id: string
  local: CropRecord<Record<ProductionMode, TierRecord<number>>>
  tourist: CropRecord<TierRecord<number>>
  label: string
}

export interface ResolutionLine {
  playerId: string
  contractUnits: number
  contractShortfall: number
  localUnits: number
  touristUnits: number
  spoilage: number
  revenue: number
  costs: number
}

export interface Resolution {
  round: number
  demand: DemandCard | null
  shock: ShockType | null
  lines: ResolutionLine[]
  note: string
}

export interface GameState {
  round: number
  phase: Phase
  players: Player[]
  drafts: Record<string, Plan>
  locked: string[]
  activePlayerIndex: number
  votePlayerIds: string[]
  votes: Record<string, CropRecord<Tier>>
  demandDeck: DemandCard[]
  shockRound: number
  shock: ShockType
  resolution: Resolution | null
}
