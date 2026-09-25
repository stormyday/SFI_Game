import { describe, expect, it } from 'vitest'
import { advanceConfirming, advancePlanning, advanceRound, createGame, resolveCurrentRound, rolePassed, updateDraft, winningCoopTier } from './gameEngine'

const names = ['A', 'B', 'C', 'D', 'E']
const fixed = () => 0

describe('game engine', () => {
  it('uses a larger co-op capacity and validates all plots are allocated', () => {
    let game = createGame(names, fixed)
    game = updateDraft(game, 'p1', { joinCoop: true, allocation: { rice: 2, vegetables: 1 } })
    expect(() => {
      let state = game
      for (let i = 0; i < 5; i++) state = advancePlanning(state)
      for (let i = 0; i < 5; i++) state = advanceConfirming(state)
    }).not.toThrow()
  })

  it('uses Standard as the co-op vote tie breaker', () => {
    let game = createGame(names, fixed)
    game.players[0].coop = true
    game.players[1].coop = true
    game.votes = { p1: { rice: 'affordable', vegetables: 'premium' }, p2: { rice: 'premium', vegetables: 'premium' } }
    expect(winningCoopTier(game, 'rice')).toBe('standard')
    expect(winningCoopTier(game, 'vegetables')).toBe('premium')
  })

  it('makes conversion active after two rounds and allows immediate reversion', () => {
    let game = createGame(names, fixed)
    game.players[0].farmStatus = 'converting'
    game.players[0].conversionStartedRound = 1
    game.round = 2
    game.phase = 'resolution'
    game = advanceRound(game)
    expect(game.players[0].farmStatus).toBe('organic')
    game = updateDraft(game, 'p1', { revertOrganic: true })
    expect(game.drafts.p1.revertOrganic).toBe(true)
  })

  it('records role completion from the public metrics', () => {
    const game = createGame(names, fixed)
    const anchor = game.players.find((p) => p.role === 'Community Anchor')!
    anchor.metrics.affordableLocalSales = 3
    expect(rolePassed(anchor)).toBe(true)
  })

  it('resolves a market closure with contract revenue but no open market sales', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 2
    game.shock = 'marketClosure'
    game.players[0].activeContract = { crop: 'rice', quantity: 2, dueRound: 2, pricePerUnit: 7 }
    game.players[0].harvests = [{ crop: 'rice', quantity: 2, mode: 'conventional', tier: 'standard', plantedRound: 1 }]
    game = resolveCurrentRound(game)
    expect(game.resolution!.lines[0].contractUnits).toBe(2)
    expect(game.resolution!.lines[0].localUnits).toBe(0)
  })

  it('splits an exact-price demand pool equally between equal offers', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 99
    game.demandDeck[0].local.rice.conventional.standard = 2
    game.players[0].harvests = [{ crop: 'rice', quantity: 2, mode: 'conventional', tier: 'standard', plantedRound: 1 }]
    game.players[1].harvests = [{ crop: 'rice', quantity: 2, mode: 'conventional', tier: 'standard', plantedRound: 1 }]
    game = resolveCurrentRound(game)
    expect(game.resolution!.lines[0].localUnits).toBe(1)
    expect(game.resolution!.lines[1].localUnits).toBe(1)
  })

  it('uses harvest for a due contract before allocating its open-market sales', () => {
    let game = createGame(names, fixed)
    game.round = 2
    game.shockRound = 99
    game.demandDeck[0].local.rice.conventional.standard = 5
    game.players[0].activeContract = { crop: 'rice', quantity: 2, dueRound: 2, pricePerUnit: 7 }
    game.players[0].harvests = [{ crop: 'rice', quantity: 3, mode: 'conventional', tier: 'standard', plantedRound: 1 }]
    game = resolveCurrentRound(game)
    expect(game.resolution!.lines[0].contractUnits).toBe(2)
    expect(game.resolution!.lines[0].localUnits).toBe(1)
  })

  it('floods only crops currently growing for the next round', () => {
    let game = createGame(names, fixed)
    game.round = 1
    game.shockRound = 1
    game.shock = 'flood'
    game.players[0].harvests = [{ crop: 'rice', quantity: 2, mode: 'conventional', tier: 'standard', plantedRound: 1 }]
    game = resolveCurrentRound(game)
    expect(game.players[0].harvests[0].quantity).toBe(1)
  })

  it('can complete a deterministic five-round shared-screen game', () => {
    let game = createGame(names, fixed)
    for (let round = 1; round <= 5; round += 1) {
      for (let player = 0; player < 5; player += 1) game = advancePlanning(game)
      for (let player = 0; player < 5; player += 1) game = advanceConfirming(game)
      expect(game.phase).toBe('resolution')
      game = advanceRound(game)
    }
    expect(game.phase).toBe('debrief')
    expect(game.players).toHaveLength(5)
  })
})
