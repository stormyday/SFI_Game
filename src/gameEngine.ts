import { DEMAND_DECK, GAME_CONFIG } from './config'
import { CROPS, Crop, CropRecord, DemandCard, FarmStatus, GameState, HarvestBatch, MODES, Phase, Plan, Player, ProductionMode, Role, ROLES, ShockType, Tier, TIERS } from './types'

const emptyPlan = (): Plan => ({
  allocation: { rice: 1, vegetables: 1 },
  prices: { rice: 'standard', vegetables: 'standard' },
  joinCoop: false,
  startOrganic: false,
  revertOrganic: false,
  contractCrop: null,
})

const clone = <T,>(value: T): T => structuredClone(value)
const shuffle = <T,>(items: T[], random = Math.random): T[] => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const rolePassed = (player: Player): boolean => {
  switch (player.role) {
    case 'Community Anchor': return player.metrics.affordableLocalSales >= 3
    case 'Organic Pioneer': return player.farmStatus === 'organic' && player.metrics.touristSales >= 3
    case 'Independent': return !player.coop && player.cash > player.startingCash
    case 'Institution Builder': return player.metrics.contractsSigned >= 2 && player.metrics.contractsFulfilled >= 2
  }
}

export const emptyVotes = (): CropRecord<Tier> => ({ rice: 'standard', vegetables: 'standard' })

export function createGame(names: string[], random = Math.random): GameState {
  const roleBag: Role[] = [...ROLES, ROLES[Math.floor(random() * ROLES.length)]]
  const roles = shuffle(roleBag, random)
  const players: Player[] = names.slice(0, GAME_CONFIG.playerCount).map((name, index) => ({
    id: `p${index + 1}`,
    name: name.trim() || `Farmer ${index + 1}`,
    role: roles[index],
    cash: GAME_CONFIG.startingCash,
    startingCash: GAME_CONFIG.startingCash,
    coop: false,
    farmStatus: 'conventional',
    conversionStartedRound: null,
    activeContract: null,
    harvests: [],
    metrics: { affordableLocalSales: 0, touristSales: 0, contractsSigned: 0, contractsFulfilled: 0, totalSpoilage: 0 },
  }))
  return {
    round: 1,
    phase: 'planning',
    players,
    drafts: Object.fromEntries(players.map((p) => [p.id, emptyPlan()])),
    locked: [],
    activePlayerIndex: 0,
    votePlayerIds: [],
    votes: {},
    demandDeck: shuffle(DEMAND_DECK, random),
    shockRound: 2 + Math.floor(random() * 3),
    shock: shuffle(GAME_CONFIG.shockDeck, random)[0],
    resolution: null,
  }
}

export const capacityFor = (player: Player, draft?: Plan): number =>
  player.coop || draft?.joinCoop ? GAME_CONFIG.coopCapacity : GAME_CONFIG.independentCapacity

export function updateDraft(state: GameState, playerId: string, patch: Partial<Plan>): GameState {
  const next = clone(state)
  if (!['planning', 'confirming'].includes(next.phase) || next.locked.includes(playerId)) return next
  const current = next.drafts[playerId]
  next.drafts[playerId] = { ...current, ...patch, allocation: patch.allocation ?? current.allocation, prices: patch.prices ?? current.prices }
  return next
}

export function advancePlanning(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'planning') return next
  if (next.activePlayerIndex < next.players.length - 1) next.activePlayerIndex += 1
  else {
    next.phase = 'confirming'
    next.activePlayerIndex = next.players.length - 1
  }
  return next
}

const farmModeForPlan = (player: Player, plan: Plan): ProductionMode => {
  if (player.farmStatus === 'organic' && !plan.revertOrganic) return 'organic'
  return 'conventional'
}

function validatePlan(player: Player, plan: Plan): void {
  const capacity = capacityFor(player, plan)
  const total = CROPS.reduce((sum, crop) => sum + plan.allocation[crop], 0)
  if (total !== capacity) throw new Error(`${player.name} must allocate exactly ${capacity} plots.`)
  if (CROPS.some((crop) => plan.allocation[crop] < 0 || !Number.isInteger(plan.allocation[crop]))) throw new Error('Plot allocation must use whole, non-negative plots.')
  if (plan.contractCrop && !(player.coop || plan.joinCoop)) throw new Error('Only cooperative members may sign contracts.')
  if (plan.contractCrop && player.activeContract) throw new Error('A farmer may hold only one active contract.')
}

function applyPlanningEffects(next: GameState): void {
  for (const player of next.players) {
    const plan = next.drafts[player.id]
    validatePlan(player, plan)
    const mode = farmModeForPlan(player, plan)
    if (plan.joinCoop) player.coop = true
    if (player.farmStatus === 'organic' && plan.revertOrganic) {
      player.farmStatus = 'conventional'
      player.conversionStartedRound = null
    } else if (player.farmStatus === 'conventional' && plan.startOrganic) {
      player.farmStatus = 'converting'
      player.conversionStartedRound = next.round
    }
    for (const crop of CROPS) {
      const plots = plan.allocation[crop]
      if (plots > 0) player.harvests.push({ crop, quantity: plots * GAME_CONFIG.yieldPerPlot, mode, tier: plan.prices[crop], plantedRound: next.round })
    }
    if (plan.contractCrop && !player.activeContract && next.round < GAME_CONFIG.rounds) {
      player.activeContract = { crop: plan.contractCrop, quantity: GAME_CONFIG.contractQuantity, dueRound: next.round + 1, pricePerUnit: GAME_CONFIG.contractPrice }
      player.metrics.contractsSigned += 1
    }
  }
}

export function advanceConfirming(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'confirming') return next
  const id = next.players[next.activePlayerIndex].id
  next.locked.push(id)
  if (next.activePlayerIndex > 0) next.activePlayerIndex -= 1
  else {
    applyPlanningEffects(next)
    next.votePlayerIds = next.players.filter((p) => p.coop).map((p) => p.id)
    next.votes = Object.fromEntries(next.votePlayerIds.map((playerId) => [playerId, emptyVotes()]))
    next.activePlayerIndex = 0
    next.phase = next.votePlayerIds.length ? 'voting' : 'resolution'
    if (!next.votePlayerIds.length) return resolveCurrentRound(next)
  }
  return next
}

export function updateVote(state: GameState, playerId: string, vote: Partial<CropRecord<Tier>>): GameState {
  const next = clone(state)
  if (next.phase !== 'voting' || next.votePlayerIds[next.activePlayerIndex] !== playerId) return next
  next.votes[playerId] = { ...next.votes[playerId], ...vote }
  return next
}

export function advanceVoting(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'voting') return next
  if (next.activePlayerIndex < next.votePlayerIds.length - 1) next.activePlayerIndex += 1
  else return resolveCurrentRound(next)
  return next
}

export function winningCoopTier(state: GameState, crop: Crop): Tier {
  const counts: Record<Tier, number> = { affordable: 0, standard: 0, premium: 0 }
  for (const vote of Object.values(state.votes)) counts[vote[crop]] += 1
  const max = Math.max(...TIERS.map((tier) => counts[tier]))
  const winners = TIERS.filter((tier) => counts[tier] === max)
  return winners.length === 1 ? winners[0] : 'standard'
}

const round2 = (value: number) => Math.round(value * 100) / 100

function takeFromBatches(batches: HarvestBatch[], crop: Crop, amount: number): number {
  let remaining = amount
  let taken = 0
  for (const batch of batches) {
    if (batch.crop !== crop || remaining <= 0) continue
    const use = Math.min(batch.quantity, remaining)
    batch.quantity = round2(batch.quantity - use)
    taken += use
    remaining -= use
  }
  return round2(taken)
}

function distributeEvenly(offers: { player: Player; batch: HarvestBatch }[], demand: number): Map<string, number> {
  const result = new Map<string, number>()
  let active = offers.filter((offer) => offer.batch.quantity > 0)
  let remaining = demand
  while (active.length && remaining > 0.0001) {
    const share = remaining / active.length
    let distributed = 0
    const stillActive: typeof active = []
    for (const offer of active) {
      const amount = Math.min(share, offer.batch.quantity)
      offer.batch.quantity = round2(offer.batch.quantity - amount)
      result.set(offer.player.id, round2((result.get(offer.player.id) ?? 0) + amount))
      distributed += amount
      if (offer.batch.quantity > 0.0001) stillActive.push(offer)
    }
    remaining = round2(remaining - distributed)
    active = stillActive
  }
  return result
}

function applyFlood(next: GameState): void {
  for (const player of next.players) {
    for (const batch of player.harvests) {
      if (batch.plantedRound === next.round) batch.quantity = round2(batch.quantity * (1 - GAME_CONFIG.floodLossFraction))
    }
  }
}

export function resolveCurrentRound(state: GameState): GameState {
  const next = clone(state)
  const isSaleRound = next.round >= 2
  const shock = next.round === next.shockRound ? next.shock : null
  if (shock === 'flood') applyFlood(next)
  const demand = isSaleRound ? next.demandDeck[next.round - 2] : null
  const lines = Object.fromEntries(next.players.map((p) => [p.id, { playerId: p.id, contractUnits: 0, contractShortfall: 0, localUnits: 0, touristUnits: 0, spoilage: 0, revenue: 0, costs: 0 }])) as Record<string, import('./types').ResolutionLine>

  if (isSaleRound && demand) {
    // Contracts always consume promised harvest before open markets.
    for (const player of next.players) {
      const contract = player.activeContract
      if (!contract || contract.dueRound !== next.round) continue
      const delivered = takeFromBatches(player.harvests, contract.crop, contract.quantity)
      const shortfall = round2(contract.quantity - delivered)
      lines[player.id].contractUnits += delivered
      lines[player.id].contractShortfall += shortfall
      lines[player.id].revenue += delivered * contract.pricePerUnit - (shortfall > 0 ? GAME_CONFIG.contractShortfallPenalty : 0)
      if (shortfall === 0) player.metrics.contractsFulfilled += 1
      player.activeContract = null
    }

    if (shock !== 'marketClosure') {
      for (const crop of CROPS) for (const mode of MODES) for (const tier of TIERS) {
        const offers = next.players.flatMap((player) => player.harvests
          .filter((batch) => batch.crop === crop && batch.mode === mode)
          .filter((batch) => (player.coop ? winningCoopTier(next, crop) : batch.tier) === tier)
          .map((batch) => ({ player, batch })))
        const localDemand = demand.local[crop][mode][tier]
        const localSales = distributeEvenly(offers, localDemand)
        for (const [playerId, units] of localSales) {
          const player = next.players.find((p) => p.id === playerId)!
          lines[playerId].localUnits += units
          lines[playerId].revenue += units * GAME_CONFIG.prices[mode][tier]
          if (tier === 'affordable') player.metrics.affordableLocalSales += units
        }
      }
      if (shock !== 'tourismCollapse') {
        for (const crop of CROPS) for (const tier of TIERS) {
          const offers = next.players.flatMap((player) => player.harvests
            .filter((batch) => batch.crop === crop && batch.mode === 'organic')
            .filter((batch) => (player.coop ? winningCoopTier(next, crop) : batch.tier) === tier)
            .map((batch) => ({ player, batch })))
          const touristSales = distributeEvenly(offers, demand.tourist[crop][tier])
          for (const [playerId, units] of touristSales) {
            lines[playerId].touristUnits += units
            lines[playerId].revenue += units * (GAME_CONFIG.prices.organic[tier] + GAME_CONFIG.touristPriceBonus)
            next.players.find((p) => p.id === playerId)!.metrics.touristSales += units
          }
        }
      }
    }

    for (const player of next.players) {
      const spoilage = player.harvests.reduce((sum, batch) => sum + batch.quantity, 0)
      lines[player.id].spoilage = round2(spoilage)
      player.metrics.totalSpoilage += spoilage
      player.harvests = []
    }
  }

  for (const player of next.players) {
    if (player.farmStatus === 'organic') lines[player.id].costs += GAME_CONFIG.organicUpkeep
    player.cash = round2(player.cash + lines[player.id].revenue - lines[player.id].costs)
    lines[player.id].revenue = round2(lines[player.id].revenue)
  }
  next.phase = 'resolution'
  next.resolution = {
    round: next.round,
    demand,
    shock,
    lines: next.players.map((p) => lines[p.id]),
    note: !isSaleRound ? 'Round 1 establishes crops for next round; there is no harvest to sell yet.' : shock === 'marketClosure' ? 'Market Closure: only institutional contracts could sell this round.' : 'Contracts resolved before local and tourist demand.',
  }
  return next
}

function activateOrganicForRound(player: Player, round: number): void {
  if (player.farmStatus === 'converting' && player.conversionStartedRound !== null && round >= player.conversionStartedRound + 2) {
    player.farmStatus = 'organic'
    player.conversionStartedRound = null
  }
}

export function advanceRound(state: GameState): GameState {
  const next = clone(state)
  if (next.phase !== 'resolution') return next
  if (next.round === GAME_CONFIG.rounds) {
    next.phase = 'debrief'
    return next
  }
  next.round += 1
  next.players.forEach((player) => activateOrganicForRound(player, next.round))
  next.phase = 'planning'
  next.activePlayerIndex = (next.round - 1) % next.players.length
  next.drafts = Object.fromEntries(next.players.map((p) => [p.id, emptyPlan()]))
  next.locked = []
  next.votes = {}
  next.votePlayerIds = []
  next.resolution = null
  return next
}

export const phaseLabel = (phase: Phase): string => ({ planning: 'Planning pass', confirming: 'Confirmation pass', voting: 'Co-op vote', resolution: 'Resolution', debrief: 'Debrief' })[phase]
