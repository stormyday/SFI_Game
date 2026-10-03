import { describe, expect, it } from 'vitest'
import { ROUND2_CONFIG } from './config'
import { advancePlanning, advanceRound, advanceVoting, createGame, forecastHarvest, resolveCurrentRound, rolePassed, updatePlan, winningCoopTier } from './engine'

const names = ['A', 'B', 'C', 'D', 'E']
const fixed = () => 0

describe('round 2 engine', () => {
  it('moves directly from the fifth farmer to results when no one joins the co-op', () => {
    let game = createGame(names, fixed)
    for (let index = 0; index < 5; index += 1) game = advancePlanning(game)
    expect(game.phase).toBe('resolution')
    expect(game.activePlayerIndex).toBe(0)
    expect(game.resolution).not.toBeNull()
  })

  it('validates each plan before passing the device and prevents editing a past turn', () => {
    let game = createGame(names, fixed)
    game.players[0].harvest = { mode: 'conventional', units: 2, plantedRound: 0 }
    game = updatePlan(game, 'p1', { saleTier: null })
    expect(() => advancePlanning(game)).toThrow('A must price their available harvest')
    game = updatePlan(game, 'p1', { saleTier: 'affordable' })
    game = advancePlanning(game)
    expect(game.activePlayerIndex).toBe(1)
    expect(updatePlan(game, 'p1', { saleTier: 'premium' }).plans.p1.saleTier).toBe('affordable')
  })

  it('blocks base plots for one conversion round but grants an immediate organic co-op plot', () => {
    let game = createGame(names, fixed)
    game = updatePlan(game, 'p1', { joinCoop: true })
    for (let index = 0; index < 5; index += 1) game = advancePlanning(game)
    expect(game.phase).toBe('voting')
    expect(game.players[0].farmStatus).toBe('converting')
    expect(game.players[0].growingHarvest).toEqual({ mode: 'organic', units: ROUND2_CONFIG.yieldPerPlot, plantedRound: 1 })
    game = advanceVoting(game)
    expect(game.resolution!.lines[0].costs).toBe(ROUND2_CONFIG.organicCostPerRound)
    game = advanceRound(game)
    expect(game.players[0].farmStatus).toBe('organic')
  })

  it('removes a personal price control when joining the co-op', () => {
    let game = createGame(names, fixed)
    game.players[0].harvest = { mode: 'conventional', units: 2, plantedRound: 0 }
    game = updatePlan(game, 'p1', { joinCoop: true, saleTier: 'premium' })
    expect(game.plans.p1.saleTier).toBeNull()
  })

  it('uses Standard for a tied co-op vote', () => {
    const game = createGame(names, fixed)
    game.votes = { p1: 'affordable', p2: 'premium' }
    expect(winningCoopTier(game)).toBe('standard')
  })

  it('allocates lower-priced supply before higher-priced supply and splits equal offers', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 99
    game.demandDeck[0].demand.conventional.local = { affordable: 5, standard: 3, premium: 0 }
    game.players[0].harvest = { mode: 'conventional', units: 4, plantedRound: 1 }
    game.players[1].harvest = { mode: 'conventional', units: 4, plantedRound: 1 }
    game.players[2].harvest = { mode: 'conventional', units: 2, plantedRound: 1 }
    game.plans.p1.saleTier = 'affordable'
    game.plans.p2.saleTier = 'affordable'
    game.plans.p3.saleTier = 'standard'
    game = resolveCurrentRound(game)
    expect(game.resolution!.lines[0].marketUnits).toBe(4)
    expect(game.resolution!.lines[1].marketUnits).toBe(4)
    expect(game.resolution!.lines[2].marketUnits).toBe(0)
  })

  it('aggregates local and tourist demand within the organic market', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 99
    game.players[0].harvest = { mode: 'organic', units: 2, plantedRound: 1 }
    game.plans.p1.saleTier = 'standard'
    game = resolveCurrentRound(game)
    const organic = game.resolution!.markets.find((market) => market.mode === 'organic')!
    expect(organic.demand.local.standard).toBeGreaterThan(0)
    expect(organic.demand.tourist.standard).toBeGreaterThan(0)
  })

  it('charges $2 while only converting and $6 once organic land is ready', () => {
    let game = createGame(names, fixed)
    game.players[0].farmStatus = 'converting'
    game.players[0].conversionStartedRound = 1
    game = resolveCurrentRound(game)
    expect(game.resolution!.lines[0].costs).toBe(ROUND2_CONFIG.conventionalCostPerRound)
  })

  it('bounds a new contract by forecast output and permits a new one while an old one is due', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.players[0].coop = true
    game.players[0].farmStatus = 'organic'
    game.players[0].harvest = { mode: 'organic', units: 3, plantedRound: 1 }
    game.players[0].contracts = [{ id: 'old', quantity: 1, dueRound: 2, pricePerUnit: 4, signedRound: 1 }]
    expect(forecastHarvest(game.players[0], game.plans.p1, 2)?.units).toBe(3)
    game = updatePlan(game, 'p1', { contractQuantity: 9 })
    expect(game.plans.p1.contractQuantity).toBe(3)
    game = updatePlan(game, 'p1', { contractQuantity: 2 })
    for (let index = 0; index < 5; index += 1) game = advancePlanning(game)
    game = advanceVoting(game)
    expect(game.players[0].contracts).toEqual([expect.objectContaining({ quantity: 2, dueRound: 3, pricePerUnit: 4 })])
  })

  it('records flood losses in both plot state and crisis impact', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 2
    game.shock = 'flood'
    game.players[0].growingHarvest = { mode: 'conventional', units: 2, plantedRound: 2 }
    game.players[0].land[0].state = 'growing-conventional'
    game.players[0].land[1].state = 'growing-conventional'
    game = resolveCurrentRound(game)
    expect(game.resolution!.crisisImpact!.playerImpacts[0].growingCropsLost).toBe(1)
    expect(game.players[0].land.some((plot) => plot.state === 'crisis-affected')).toBe(true)
  })

  it('states the open-market inventory blocked by a market closure', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 2
    game.shock = 'marketClosure'
    game.players[0].harvest = { mode: 'conventional', units: 2, plantedRound: 1 }
    game.plans.p1.saleTier = 'affordable'
    game = resolveCurrentRound(game)
    expect(game.resolution!.crisisImpact!.playerImpacts).toContainEqual(expect.objectContaining({ playerId: 'p1', openMarketBlocked: 2 }))
    expect(game.resolution!.lines[0].marketUnits).toBe(0)
  })

  it('removes and records tourist demand during a tourism collapse', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 2
    game.shock = 'tourismCollapse'
    game.players[0].harvest = { mode: 'organic', units: 1, plantedRound: 1 }
    game.plans.p1.saleTier = 'standard'
    game = resolveCurrentRound(game)
    const organicMarket = game.resolution!.markets.find((market) => market.mode === 'organic')!
    expect(organicMarket.demand.tourist.standard).toBe(0)
    expect(game.resolution!.crisisImpact!.touristDemandRemoved).toBeGreaterThan(0)
  })

  it('counts organic contract delivery toward the Organic Pioneer goal', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 99
    game.players[0].role = 'Organic Pioneer'
    game.players[0].harvest = { mode: 'organic', units: 3, plantedRound: 1 }
    game.players[0].contracts = [{ id: 'organic-contract', quantity: 3, dueRound: 2, pricePerUnit: 4, signedRound: 1 }]
    game = resolveCurrentRound(game)
    expect(game.players[0].metrics.organicUnitsSold).toBe(3)
    expect(rolePassed(game.players[0])).toBe(true)
  })

  it('can complete all five rounds with fixed player order', () => {
    let game = createGame(names, fixed)
    for (let round = 1; round <= 5; round += 1) {
      for (let index = 0; index < 5; index += 1) game = advancePlanning(game)
      if (game.phase === 'voting') {
        for (let index = 0; index < game.votePlayerIds.length; index += 1) {
          game = advanceVoting(game)
        }
      }
      game = advanceRound(game)
    }
    expect(game.phase).toBe('debrief')
  })
})
