import { ROUND2_CONFIG, ROUND2_DEMAND_DECK } from './config'
import { Contract, CrisisImpact, DemandCard, GameState, LandPlot, MarketSnapshot, Mode, Player, PlotState, ResolutionLine, Role, ROLES, SOURCES, Source, SourceDemand, Tier, TIERS, TierValues, TurnPlan } from './types'

const clone = <T,>(value: T): T => structuredClone(value)
const emptyTiers = (): TierValues => ({ affordable: 0, standard: 0, premium: 0 })
const tierRank = (tier: Tier) => TIERS.indexOf(tier)
const round2 = (value: number) => Math.round(value * 100) / 100
const shuffle = <T,>(items: T[], random = Math.random): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

const freshLand = (): LandPlot[] => [
  { id: 'base-1', kind: 'base', state: 'empty' },
  { id: 'base-2', kind: 'base', state: 'empty' },
  { id: 'coop-1', kind: 'coop', state: 'empty' },
]

const emptyPlan = (player: Player): TurnPlan => ({
  saleTier: player.harvest && !player.coop ? 'standard' : null,
  joinCoop: false,
  startConversion: false,
  contractQuantity: null,
})

export const conversionRoundsLeft = (player: Player, round: number): number => {
  if (player.farmStatus !== 'converting' || player.conversionStartedRound === null) return 0
  return Math.max(0, 1 - (round - player.conversionStartedRound))
}

export const farmOperatingCost = (player: Player): number =>
  player.coop || player.farmStatus === 'organic' ? ROUND2_CONFIG.organicCostPerRound : ROUND2_CONFIG.conventionalCostPerRound

export const roleInstruction = (role: Role): string => ({
  'Community Anchor': 'Sell 3 units to Local buyers at the Affordable tier.',
  'Organic Pioneer': 'Sell any 3 organic crop units through a market or contract.',
  Independent: 'Never join the co-op and finish with more cash than you started.',
  'Institution Builder': 'Sign and fulfil 2 institutional contracts.',
})[role]

export const rolePassed = (player: Player): boolean => {
  if (player.role === 'Community Anchor') return player.metrics.affordableLocalSales >= 3
  if (player.role === 'Organic Pioneer') return player.metrics.organicUnitsSold >= 3
  if (player.role === 'Independent') return !player.coop && player.cash > player.startingCash
  return player.metrics.contractsSigned >= 2 && player.metrics.contractsFulfilled >= 2
}

export function forecastHarvest(player: Player, plan: TurnPlan, round: number): Player['growingHarvest'] {
  const willCoop = player.coop || plan.joinCoop
  const willConvert = player.farmStatus === 'conventional' && (plan.startConversion || plan.joinCoop)
  const futureStatus = willConvert ? 'converting' : player.farmStatus
  const basePlots = futureStatus === 'conventional' || futureStatus === 'organic' ? ROUND2_CONFIG.basePlots : 0
  const mode: Mode = futureStatus === 'conventional' ? 'conventional' : 'organic'
  const plots = basePlots + (willCoop ? ROUND2_CONFIG.coopOrganicPlots : 0)
  return plots ? { mode, units: plots * ROUND2_CONFIG.yieldPerPlot, plantedRound: round } : null
}

export function previewLandPlots(player: Player, plan: TurnPlan): LandPlot[] {
  const willCoop = player.coop || plan.joinCoop
  const willConvert = player.farmStatus === 'conventional' && (plan.startConversion || plan.joinCoop)
  const baseState: PlotState = willConvert || player.farmStatus === 'converting' ? 'converting' : player.farmStatus === 'organic' ? 'growing-organic' : 'growing-conventional'
  return freshLand().map((plot) => plot.kind === 'base' ? { ...plot, state: baseState } : { ...plot, state: willCoop ? 'growing-organic' : 'empty' })
}

export function createGame(names: string[], random = Math.random): GameState {
  const roleBag: Role[] = [...ROLES, ROLES[Math.floor(random() * ROLES.length)]]
  const roles = shuffle(roleBag, random)
  const players = names.slice(0, ROUND2_CONFIG.playerCount).map((name, index): Player => ({
    id: `p${index + 1}`,
    name: name.trim() || `Farmer ${index + 1}`,
    role: roles[index],
    cash: ROUND2_CONFIG.startingCash,
    startingCash: ROUND2_CONFIG.startingCash,
    coop: false,
    farmStatus: 'conventional',
    conversionStartedRound: null,
    land: freshLand(),
    harvest: null,
    growingHarvest: null,
    contracts: [],
    metrics: { affordableLocalSales: 0, touristSales: 0, organicUnitsSold: 0, contractsSigned: 0, contractsFulfilled: 0, totalSpoilage: 0 },
  }))
  return {
    round: 1,
    phase: 'planning',
    players,
    plans: Object.fromEntries(players.map((player) => [player.id, emptyPlan(player)])),
    activePlayerIndex: 0,
    votePlayerIds: [],
    votes: {},
    demandDeck: shuffle(ROUND2_DEMAND_DECK, random),
    shockRound: 2 + Math.floor(random() * 3),
    shock: shuffle(ROUND2_CONFIG.shockDeck, random)[0],
    resolution: null,
  }
}

export function updatePlan(state: GameState, playerId: string, patch: Partial<TurnPlan>): GameState {
  const next = clone(state)
  if (next.phase !== 'planning' || next.players[next.activePlayerIndex].id !== playerId) return next
  const player = next.players.find((entry) => entry.id === playerId)!
  const updated = { ...next.plans[playerId], ...patch }
  if (player.coop || updated.joinCoop || !player.harvest) updated.saleTier = null
  if (player.farmStatus !== 'conventional' || updated.joinCoop) updated.startConversion = false
  const forecast = forecastHarvest(player, updated, next.round)
  if (!(player.coop || updated.joinCoop) || !forecast) updated.contractQuantity = null
  else if (updated.contractQuantity && updated.contractQuantity > forecast.units) updated.contractQuantity = forecast.units
  next.plans[playerId] = updated
  return next
}

export function advancePlanning(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'planning') return next
  const player = next.players[next.activePlayerIndex]
  validatePlan(player, next.plans[player.id], next.round)
  if (next.activePlayerIndex < next.players.length - 1) {
    next.activePlayerIndex += 1
    return next
  }
  applyPlans(next)
  next.votePlayerIds = next.players.filter((entry) => entry.coop).map((entry) => entry.id)
  next.votes = Object.fromEntries(next.votePlayerIds.map((id) => [id, 'standard']))
  next.activePlayerIndex = 0
  next.phase = next.votePlayerIds.length ? 'voting' : 'resolution'
  return next.votePlayerIds.length ? next : resolveCurrentRound(next)
}

function validatePlan(player: Player, plan: TurnPlan, round: number): void {
  if (player.harvest && !player.coop && !plan.joinCoop && !plan.saleTier) throw new Error(`${player.name} must price their available harvest.`)
  if (plan.contractQuantity !== null) {
    if (!(player.coop || plan.joinCoop)) throw new Error('Only co-op members may sign an institutional contract.')
    if (round >= ROUND2_CONFIG.rounds) throw new Error('No new contracts can be due after the final round.')
    const forecast = forecastHarvest(player, plan, round)
    if (!forecast || plan.contractQuantity < 1 || plan.contractQuantity > forecast.units) throw new Error('Contract quantity must be within this round’s forecast harvest.')
  }
}

function transitionOrganicStatus(player: Player, round: number): void {
  if (player.farmStatus === 'converting' && player.conversionStartedRound !== null && round >= player.conversionStartedRound + 1) {
    player.farmStatus = 'organic'
    player.conversionStartedRound = null
  }
}

function applyPlans(next: GameState): void {
  for (const player of next.players) {
    const plan = next.plans[player.id]
    validatePlan(player, plan, next.round)
    if (plan.joinCoop && !player.coop) {
      player.coop = true
      if (player.farmStatus === 'conventional') { player.farmStatus = 'converting'; player.conversionStartedRound = next.round }
    } else if (plan.startConversion && player.farmStatus === 'conventional') {
      player.farmStatus = 'converting'
      player.conversionStartedRound = next.round
    }
    if (plan.contractQuantity !== null) {
      const contract: Contract = { id: `${player.id}-r${next.round}`, quantity: plan.contractQuantity, dueRound: next.round + 1, pricePerUnit: ROUND2_CONFIG.contractPrice, signedRound: next.round }
      player.contracts.push(contract)
      player.metrics.contractsSigned += 1
    }
    player.growingHarvest = forecastHarvest(player, plan, next.round)
    player.land = previewLandPlots(player, plan)
  }
}

export function updateVote(state: GameState, playerId: string, tier: Tier): GameState {
  const next = clone(state)
  if (next.phase === 'voting' && next.votePlayerIds[next.activePlayerIndex] === playerId) next.votes[playerId] = tier
  return next
}

export function winningCoopTier(state: GameState): Tier {
  const counts = emptyTiers()
  Object.values(state.votes).forEach((tier) => { counts[tier] += 1 })
  const max = Math.max(...TIERS.map((tier) => counts[tier]))
  const winners = TIERS.filter((tier) => counts[tier] === max)
  return winners.length === 1 ? winners[0] : 'standard'
}

export function advanceVoting(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'voting') return next
  if (next.activePlayerIndex < next.votePlayerIds.length - 1) { next.activePlayerIndex += 1; return next }
  return resolveCurrentRound(next)
}

export const combinedDemand = (demand: SourceDemand): TierValues => TIERS.reduce((total, tier) => {
  total[tier] = SOURCES.reduce((sum, source) => sum + demand[source][tier], 0)
  return total
}, emptyTiers())

function effectiveDemand(demand: SourceDemand, shock: GameState['shock'] | null): SourceDemand {
  const next = clone(demand)
  if (shock === 'tourismCollapse') next.tourist = emptyTiers()
  return next
}

interface Offer { player: Player; units: number; tier: Tier }

function allocateSourceUnits(amount: number, tier: Tier, remaining: SourceDemand): Record<Source, number> {
  const allocated: Record<Source, number> = { local: 0, tourist: 0 }
  let left = amount
  for (let index = tierRank(tier); index < TIERS.length && left > 0.0001; index += 1) {
    const willingness = TIERS[index]
    for (const source of SOURCES) {
      const used = Math.min(left, remaining[source][willingness])
      remaining[source][willingness] = round2(remaining[source][willingness] - used)
      allocated[source] = round2(allocated[source] + used)
      left = round2(left - used)
      if (left <= 0.0001) break
    }
  }
  return allocated
}

function equalSplit(offers: Offer[], amount: number): Map<string, number> {
  const result = new Map<string, number>()
  let available = [...offers]
  let left = amount
  while (available.length && left > 0.0001) {
    const share = left / available.length
    let used = 0
    const remaining: Offer[] = []
    for (const offer of available) {
      const sale = Math.min(share, offer.units)
      offer.units = round2(offer.units - sale)
      result.set(offer.player.id, round2((result.get(offer.player.id) ?? 0) + sale))
      used += sale
      if (offer.units > 0.0001) remaining.push(offer)
    }
    left = round2(left - used)
    available = remaining
  }
  return result
}

function resolveMarket(mode: Mode, demand: SourceDemand, offers: Offer[], lines: Record<string, ResolutionLine>): MarketSnapshot {
  const remainingDemand = clone(demand)
  const supplyByTier = emptyTiers()
  const soldByTier = emptyTiers()
  offers.forEach((offer) => { supplyByTier[offer.tier] += offer.units })
  for (const tier of TIERS) {
    const sameTier = offers.filter((offer) => offer.tier === tier && offer.units > 0)
    const eligibleDemand = TIERS.slice(tierRank(tier)).reduce((sum, willingness) => sum + SOURCES.reduce((sourceSum, source) => sourceSum + remainingDemand[source][willingness], 0), 0)
    const sold = Math.min(eligibleDemand, sameTier.reduce((sum, offer) => sum + offer.units, 0))
    if (sold <= 0) continue
    const byPlayer = equalSplit(sameTier, sold)
    const sources = allocateSourceUnits(sold, tier, remainingDemand)
    soldByTier[tier] = round2(sold)
    const totalSold = [...byPlayer.values()].reduce((sum, value) => sum + value, 0)
    for (const [playerId, units] of byPlayer) {
      const proportion = totalSold ? units / totalSold : 0
      const local = round2(sources.local * proportion)
      const tourist = round2(sources.tourist * proportion)
      lines[playerId].localUnits += local
      lines[playerId].touristUnits += tourist
      if (tier === 'affordable') lines[playerId].affordableLocalUnits += local
      if (mode === 'organic') lines[playerId].organicUnitsSold += units
      lines[playerId].marketUnits += units
      lines[playerId].revenue += units * ROUND2_CONFIG.prices[mode][tier]
    }
  }
  return { mode, demand, supplyByTier, soldByTier }
}

function applyFlood(next: GameState, impact: CrisisImpact): void {
  for (const player of next.players) {
    if (!player.growingHarvest || player.growingHarvest.plantedRound !== next.round) continue
    const lost = Math.round(player.growingHarvest.units * ROUND2_CONFIG.floodLossFraction)
    player.growingHarvest.units = Math.max(0, player.growingHarvest.units - lost)
    let left = lost
    player.land = player.land.map((plot) => {
      if (left > 0 && (plot.state === 'growing-conventional' || plot.state === 'growing-organic')) { left -= 1; return { ...plot, state: 'crisis-affected' } }
      return plot
    })
    impact.playerImpacts.push({ playerId: player.id, growingCropsLost: lost, openMarketBlocked: 0 })
  }
}

const initialLine = (player: Player): ResolutionLine => ({ playerId: player.id, contractUnits: 0, contractShortfall: 0, localUnits: 0, touristUnits: 0, affordableLocalUnits: 0, organicUnitsSold: 0, marketUnits: 0, spoilage: 0, revenue: 0, costs: 0 })

export function resolveCurrentRound(state: GameState): GameState {
  const next = clone(state)
  const saleRound = next.round >= 2
  const shock = next.round === next.shockRound ? next.shock : null
  const demandCard = saleRound ? next.demandDeck[next.round - 2] : null
  const lines = Object.fromEntries(next.players.map((player) => [player.id, initialLine(player)])) as Record<string, ResolutionLine>
  const impact: CrisisImpact | null = shock ? { shock, headline: '', playerImpacts: [], touristDemandRemoved: 0 } : null
  if (shock === 'flood' && impact) {
    applyFlood(next, impact)
    impact.headline = 'Flood reduced crops that are currently growing for the next sale round.'
  }
  const markets: MarketSnapshot[] = []

  if (saleRound && demandCard) {
    for (const player of next.players) {
      const due = player.contracts.filter((contract) => contract.dueRound === next.round)
      for (const contract of due) {
        const harvestMode = player.harvest?.mode
        const delivered = Math.min(contract.quantity, player.harvest?.units ?? 0)
        if (player.harvest) player.harvest.units = round2(player.harvest.units - delivered)
        const shortfall = round2(contract.quantity - delivered)
        lines[player.id].contractUnits += delivered
        lines[player.id].contractShortfall += shortfall
        if (harvestMode === 'organic') lines[player.id].organicUnitsSold += delivered
        lines[player.id].revenue += delivered * contract.pricePerUnit - (shortfall ? ROUND2_CONFIG.contractShortfallPenalty : 0)
        if (!shortfall) player.metrics.contractsFulfilled += 1
      }
      player.contracts = player.contracts.filter((contract) => contract.dueRound !== next.round)
    }
    if (shock !== 'marketClosure') {
      for (const mode of ['conventional', 'organic'] as Mode[]) {
        const demand = effectiveDemand(demandCard.demand[mode], shock)
        if (shock === 'tourismCollapse' && impact && mode === 'organic') impact.touristDemandRemoved = combinedDemand(demandCard.demand.organic).standard - combinedDemand(demand).standard + combinedDemand(demandCard.demand.organic).premium - combinedDemand(demand).premium
        const offers: Offer[] = next.players.flatMap((player) => {
          if (!player.harvest || player.harvest.mode !== mode || player.harvest.units <= 0) return []
          const tier = player.coop ? winningCoopTier(next) : next.plans[player.id].saleTier
          return tier ? [{ player, units: player.harvest.units, tier }] : []
        })
        const snapshot = resolveMarket(mode, demand, offers, lines)
        markets.push(snapshot)
        for (const offer of offers) {
          const player = next.players.find((entry) => entry.id === offer.player.id)!
          if (player.harvest) player.harvest.units = offer.units
        }
      }
      if (shock === 'tourismCollapse' && impact) impact.headline = `Tourism collapse removed ${impact.touristDemandRemoved} Tourist demand units from the organic market.`
    } else if (impact) {
      for (const player of next.players) {
        const blocked = player.harvest?.units ?? 0
        if (blocked) impact.playerImpacts.push({ playerId: player.id, growingCropsLost: 0, openMarketBlocked: blocked })
      }
      impact.headline = 'Market closure prevented all open-market sales; only institutional contracts could be fulfilled.'
    }
    for (const player of next.players) {
      const spoilage = player.harvest?.units ?? 0
      lines[player.id].spoilage = spoilage
      player.metrics.totalSpoilage = round2(player.metrics.totalSpoilage + spoilage)
      player.harvest = null
      player.metrics.affordableLocalSales = round2(player.metrics.affordableLocalSales + lines[player.id].affordableLocalUnits)
      player.metrics.touristSales = round2(player.metrics.touristSales + lines[player.id].touristUnits)
      player.metrics.organicUnitsSold = round2(player.metrics.organicUnitsSold + lines[player.id].organicUnitsSold)
    }
  }
  for (const player of next.players) {
    lines[player.id].costs = farmOperatingCost(player)
    player.cash = round2(player.cash + lines[player.id].revenue - lines[player.id].costs)
    lines[player.id].revenue = round2(lines[player.id].revenue)
  }
  next.phase = 'resolution'
  next.resolution = {
    round: next.round,
    demand: demandCard,
    shock,
    crisisImpact: impact,
    markets,
    lines: next.players.map((player) => lines[player.id]),
    note: !saleRound ? 'Round 1 prepares the first harvest. There is no inventory to price or sell yet.' : shock === 'marketClosure' ? 'Market closure: only due institutional contracts could sell this round.' : 'Demand was revealed after every farmer finished planning. Lower-priced offers served eligible buyers first.',
  }
  return next
}

export function advanceRound(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'resolution') return next
  if (next.round === ROUND2_CONFIG.rounds) { next.phase = 'debrief'; return next }
  next.round += 1
  next.players.forEach((player) => {
    transitionOrganicStatus(player, next.round)
    player.harvest = player.growingHarvest
    player.growingHarvest = null
    player.land = freshLand()
  })
  next.phase = 'planning'
  next.activePlayerIndex = 0
  next.plans = Object.fromEntries(next.players.map((player) => [player.id, emptyPlan(player)]))
  next.votePlayerIds = []
  next.votes = {}
  next.resolution = null
  return next
}

export const phaseLabel = (phase: GameState['phase']): string => ({ planning: 'Planning', voting: 'Co-op vote', resolution: 'Market resolution', debrief: 'Debrief' })[phase]
