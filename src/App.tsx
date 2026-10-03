import { useEffect, useMemo, useState } from 'react'
import { ROUND2_CONFIG } from './round2/config'
import { advancePlanning, advanceRound, advanceVoting, combinedDemand, conversionRoundsLeft, createGame, farmOperatingCost, forecastHarvest, phaseLabel, previewLandPlots, roleInstruction, rolePassed, updatePlan, updateVote, winningCoopTier } from './round2/engine'
import { GameState, MarketSnapshot, Player, Tier, TIERS } from './round2/types'

const title = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
const money = (value: number) => `$${value.toFixed(2)}`
const signedMoney = (value: number) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`
const units = (value: number) => `${value.toFixed(value % 1 ? 2 : 0)} units`

const statusLabel = (player: Player, round: number) => {
  if (player.farmStatus === 'converting') return `Converting · ${conversionRoundsLeft(player, round)} round${conversionRoundsLeft(player, round) === 1 ? '' : 's'} left`
  return player.farmStatus === 'organic' ? 'Organic active' : 'Conventional'
}

function App() {
  const [names, setNames] = useState(['Farmer 1', 'Farmer 2', 'Farmer 3', 'Farmer 4', 'Farmer 5'])
  const [game, setGame] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activePlayer = useMemo(() => {
    if (!game) return null
    if (game.phase === 'planning') return game.players[game.activePlayerIndex]
    if (game.phase === 'voting') return game.players.find((player) => player.id === game.votePlayerIds[game.activePlayerIndex]) ?? null
    return null
  }, [game])

  useEffect(() => {
    if (game) document.getElementById('screen-heading')?.focus()
  }, [game?.round, game?.phase, game?.activePlayerIndex])

  const transition = (action: (state: GameState) => GameState) => {
    try {
      if (game) setGame(action(game))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That action could not be completed.')
    }
  }

  if (!game) return <Setup names={names} setNames={setNames} start={() => setGame(createGame(names))} />

  const plan = activePlayer ? game.plans[activePlayer.id] : null
  return <main className="round-two-shell">
    <header className="r2-header">
      <div><p className="eyebrow">Five farmers · one shared screen</p><h1>Food Resilience Market</h1></div>
      <div className="phase-pill"><strong>Round {game.round} / {ROUND2_CONFIG.rounds}</strong><span>{phaseLabel(game.phase)}</span></div>
      <button className="quiet" onClick={() => { if (window.confirm('Start a new game? Current progress will be lost.')) { setGame(null); setError(null) } }}>New game</button>
    </header>

    <PhaseGuide game={game} />
    {activePlayer && <TurnProgress game={game} />}
    {error && <p className="error" role="alert">{error}</p>}

    {game.phase === 'planning' && activePlayer && plan && <PlanningWorkspace game={game} player={activePlayer} onChange={(patch) => transition((state) => updatePlan(state, activePlayer.id, patch))} onAdvance={() => transition(advancePlanning)} />}
    {game.phase === 'voting' && activePlayer && <VoteWorkspace game={game} player={activePlayer} onVote={(tier) => transition((state) => updateVote(state, activePlayer.id, tier))} onAdvance={() => transition(advanceVoting)} />}
    {game.phase === 'resolution' && game.resolution && <Resolution game={game} onNext={() => transition(advanceRound)} />}
    {game.phase === 'debrief' && <Debrief game={game} />}

    {(game.phase === 'planning' || game.phase === 'voting') && <MarketPreview game={game} />}
    {game.phase !== 'debrief' && <PlayerRail game={game} activeId={activePlayer?.id ?? null} />}
  </main>
}

function PhaseGuide({ game }: { game: GameState }) {
  const phases: { key: GameState['phase']; label: string }[] = [
    { key: 'planning', label: 'Plan' }, { key: 'voting', label: 'Co-op vote' },
    { key: 'resolution', label: 'Reveal sales' },
    { key: 'debrief', label: 'Debrief' },
  ]
  const current = phases.findIndex((step) => step.key === game.phase)
  return <section className="phase-guide" aria-label="Round sequence">{phases.map((step, index) => {
    const skipped = step.key === 'voting' && index < current && game.votePlayerIds.length === 0
    return <span key={step.key} className={index === current ? 'current' : skipped ? 'skipped' : index < current ? 'complete' : ''} aria-current={index === current ? 'step' : undefined}>{skipped ? '— ' : index < current ? '✓ ' : `${index + 1}. `}{skipped ? 'No co-op vote' : step.label}</span>
  })}</section>
}

function TurnProgress({ game }: { game: GameState }) {
  const players = game.phase === 'voting' ? game.votePlayerIds.map((id) => game.players.find((player) => player.id === id)!) : game.players
  const label = game.phase === 'planning' ? 'Planning' : 'Co-op vote'
  return <section className="turn-progress" aria-label={`${label} progress`}>
    <strong>{label} · Player {game.activePlayerIndex + 1} of {players.length}</strong>
    <div className="turn-steps" style={{ gridTemplateColumns: `repeat(${players.length}, minmax(95px, 1fr))` }}>{players.map((player, index) => <span key={player.id} className={index === game.activePlayerIndex ? 'current' : index < game.activePlayerIndex ? 'complete' : ''} aria-current={index === game.activePlayerIndex ? 'step' : undefined}>{index < game.activePlayerIndex ? '✓ ' : ''}{player.name}</span>)}</div>
  </section>
}

function Setup({ names, setNames, start }: { names: string[]; setNames: (names: string[]) => void; start: () => void }) {
  return <main className="setup-shell"><section className="setup-panel">
    <p className="eyebrow">Five players · five rounds · one shared screen</p><h1>Food Resilience Market</h1>
    <p className="lead">Take turns running a farm. Choose how to grow, set prices when harvest is ready, and see how the market responds. Each farmer receives a public goal.</p>
    <div className="how-it-works"><strong>Each round</strong><ol><li>Each farmer takes one turn to choose a farm path and price any harvest.</li><li>Co-op members vote on a shared sale price.</li><li>Demand is revealed and everyone sees what sold.</li></ol></div>
    <h2>Who is playing?</h2>
    <div className="name-grid">{names.map((name, index) => <label key={index}>Player {index + 1}<input value={name} onChange={(event) => setNames(names.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /></label>)}</div>
    <button className="primary" onClick={start}>Start game</button>
  </section></main>
}

function PlanningWorkspace({ game, player, onChange, onAdvance }: { game: GameState; player: Player; onChange: (patch: Partial<GameState['plans'][string]>) => void; onAdvance: () => void }) {
  const plan = game.plans[player.id]
  const forecast = forecastHarvest(player, plan, game.round)
  const previewLand = previewLandPlots(player, plan)
  const choice = plan.joinCoop ? 'coop' : plan.startConversion ? 'convert' : 'keep'
  const nextPlayer = game.players[game.activePlayerIndex + 1]
  const willVote = game.players.some((entry) => entry.coop || game.plans[entry.id].joinCoop)
  const nextStep = nextPlayer ? `Next: ${nextPlayer.name}` : willVote ? 'Next: co-op vote' : 'Next: market results'
  return <section className="workspace" aria-labelledby="screen-heading">
    <div className="workspace-heading"><p className="eyebrow">Your turn</p><h2 id="screen-heading" tabIndex={-1}>{player.name}, make your choices</h2><p>Your choices are final when you finish this turn. Demand stays hidden until every farmer has played.</p></div>
    <div className="workspace-grid"><div className="decision-flow">
      {player.harvest ? <section className="action-card"><p className="card-kicker">1 · Harvest ready now</p><h3>Set this round’s sale price</h3><HarvestGrid player={player} round={game.round} />
        {player.coop || plan.joinCoop ? <p className="decision-note">The co-op will vote on a shared price tier after every farmer finishes their turn.</p> : <><label className="field">Your sale price<select value={plan.saleTier ?? ''} onChange={(event) => onChange({ saleTier: event.target.value as Tier })}><option value="">Choose a tier</option>{TIERS.map((tier) => <option key={tier} value={tier}>{title(tier)} · {money(ROUND2_CONFIG.prices[player.harvest!.mode][tier])}/unit</option>)}</select></label><p className="hint">Lower prices can reach more buyers; higher prices earn more per unit sold.</p></>}
      </section> : <p className="inline-note">No harvest is ready to sell this round. Focus on what your farm will grow next.</p>}

      <section className="action-card"><p className="card-kicker">{player.harvest ? '2' : '1'} · Farm for the next sale round</p><h3>Choose how to grow</h3>
        {player.coop ? <p className="decision-note">You are a co-op member. Your farm grows organic crop and the group votes on its sale price.</p> : <fieldset className="farm-options"><legend className="sr-only">Farm path</legend>
          <label className={choice === 'keep' ? 'option selected' : 'option'}><input type="radio" name={`farm-path-${player.id}`} checked={choice === 'keep'} onChange={() => onChange({ joinCoop: false, startConversion: false })} /><span><strong>{player.farmStatus === 'organic' ? 'Stay independent' : 'Keep conventional farming'}</strong><small>{player.farmStatus === 'organic' ? 'Grow on your organic plots and set your own price. $6 farm cost.' : 'Grow on both base plots and set your own price. $2 farm cost.'}</small></span></label>
          {player.farmStatus === 'conventional' && <label className={choice === 'convert' ? 'option selected' : 'option'}><input type="radio" name={`farm-path-${player.id}`} checked={choice === 'convert'} onChange={() => onChange({ joinCoop: false, startConversion: true })} /><span><strong>Convert to organic</strong><small>{game.round === ROUND2_CONFIG.rounds ? 'Base plots rest; no later sale round remains. $2 farm cost.' : 'Base plots rest this round; they grow organic crop next round. $2 cost now, then $6.'}</small></span></label>}
          <label className={choice === 'coop' ? 'option selected' : 'option'}><input type="radio" name={`farm-path-${player.id}`} checked={choice === 'coop'} onChange={() => onChange({ joinCoop: true, startConversion: false })} /><span><strong>Join the co-op permanently</strong><small>{game.round === ROUND2_CONFIG.rounds ? 'Vote on a shared price now. New growth will not reach a sale round. $6 farm cost.' : 'Gain one organic plot now, access contracts, and vote on a shared price. Conventional base plots convert this round. $6 farm cost.'}</small></span></label>
        </fieldset>}
        <div className="farm-forecast"><strong>{game.round === ROUND2_CONFIG.rounds ? 'Final growing round' : `Expected harvest for Round ${game.round + 1}`}</strong><span>{game.round === ROUND2_CONFIG.rounds ? 'There is no later sale round.' : forecast ? `${units(forecast.units)} ${forecast.mode} crop, before any shock` : 'No crop while base plots convert'}</span></div>
        <LandGrid land={previewLand} />
      </section>

      {(player.coop || plan.joinCoop) && game.round < ROUND2_CONFIG.rounds && forecast && <section className="action-card"><p className="card-kicker">{player.harvest ? '3' : '2'} · Co-op option</p><h3>Reserve next round’s harvest</h3><label className="field">New institutional contract<select value={plan.contractQuantity ?? ''} onChange={(event) => onChange({ contractQuantity: event.target.value ? Number(event.target.value) : null })}><option value="">No new contract</option>{Array.from({ length: forecast.units }, (_, index) => index + 1).map((quantity) => <option value={quantity} key={quantity}>{units(quantity)} due Round {game.round + 1}</option>)}</select></label><p className="hint">Up to {units(forecast.units)} at {money(ROUND2_CONFIG.contractPrice)}/unit. A shortfall costs {money(ROUND2_CONFIG.contractShortfallPenalty)}.</p></section>}
    </div>
    <aside className="turn-sidebar" aria-label="Your farm at a glance"><div className="goal-box"><p className="card-kicker">Your public goal</p><strong>{player.role}</strong><span>{roleInstruction(player.role)}</span><small>{roleProgress(player)}</small></div><div className="farm-facts"><h3>Farm at a glance</h3><dl><div><dt>Cash</dt><dd>{money(player.cash)}</dd></div><div><dt>Farm now</dt><dd>{statusLabel(player, game.round)}</dd></div><div><dt>Planned farm cost</dt><dd>{money(plan.joinCoop ? ROUND2_CONFIG.organicCostPerRound : farmOperatingCost(player))} this round</dd></div><div><dt>Co-op</dt><dd>{player.coop ? 'Member' : plan.joinCoop ? 'Joining this round' : 'Independent'}</dd></div></dl>{player.contracts.length > 0 && <div className="contract-list"><strong>Existing contracts</strong>{player.contracts.map((contract) => <span key={contract.id}>{units(contract.quantity)} due Round {contract.dueRound} · {money(contract.pricePerUnit)}/unit</span>)}</div>}</div></aside>
    </div>
    <div className="turn-footer"><button className="primary advance" onClick={onAdvance}>Finish turn and continue</button><span>{nextStep}</span></div>
  </section>
}

function LandGrid({ land }: { land: Player['land'] }) {
  return <div className="asset-grid"><strong>Plots this round</strong><div className="plot-grid">{land.map((plot) => <div className={`plot ${plot.state}`} key={plot.id}><span>{plot.kind === 'base' ? 'Base plot' : 'Co-op plot'}</span><strong>{plot.state === 'empty' ? 'Not in use' : title(plot.state.replace('-', ' '))}</strong></div>)}</div></div>
}

function HarvestGrid({ player, round }: { player: Player; round: number }) {
  const reserved = player.contracts.filter((contract) => contract.dueRound === round).reduce((sum, contract) => sum + contract.quantity, 0)
  return <div className="harvest-summary"><strong>{units(player.harvest!.units)} {player.harvest!.mode} crop</strong><span>{reserved ? `${units(reserved)} committed to a contract` : 'No contract due this round'}</span></div>
}

function VoteWorkspace({ game, player, onVote, onAdvance }: { game: GameState; player: Player; onVote: (tier: Tier) => void; onAdvance: () => void }) {
  const selected = game.votes[player.id]
  const nextVoter = game.players.find((entry) => entry.id === game.votePlayerIds[game.activePlayerIndex + 1])
  return <section className="workspace vote-workspace" aria-labelledby="screen-heading"><div className="workspace-heading"><p className="eyebrow">Shared price decision</p><h2 id="screen-heading" tabIndex={-1}>{player.name}, choose the co-op price</h2><p>Every co-op open-market sale uses the winning tier. Contract sales have a fixed price. Ties use Standard.</p></div><div className="vote-options">{TIERS.map((tier) => <label className={selected === tier ? 'option selected' : 'option'} key={tier}><input type="radio" name="coop-vote" checked={selected === tier} onChange={() => onVote(tier)} /><span><strong>{title(tier)}</strong><small>Conventional {money(ROUND2_CONFIG.prices.conventional[tier])} · Organic {money(ROUND2_CONFIG.prices.organic[tier])} per unit</small></span></label>)}</div><div className="turn-footer"><button className="primary advance" onClick={onAdvance}>{nextVoter ? 'Finish vote and continue' : 'Finish vote and reveal demand'}</button><span>{nextVoter ? `Next: ${nextVoter.name}` : 'Next: market results'}</span></div></section>
}

function MarketPreview({ game }: { game: GameState }) {
  const rows = game.players.flatMap((player) => {
    if (!player.harvest) return []
    const tier = player.coop || game.plans[player.id]?.joinCoop ? 'Co-op vote pending' : title(game.plans[player.id]?.saleTier ?? 'not priced')
    const reserved = player.contracts.filter((contract) => contract.dueRound === game.round).reduce((sum, contract) => sum + contract.quantity, 0)
    const marketUnits = Math.max(0, player.harvest.units - reserved)
    return [{ player, tier, marketUnits }]
  })
  return <section className="market-preview" aria-label="Visible market offers"><div><p className="card-kicker">Visible offers</p><p>Contract units are reserved first. Demand stays hidden until the reveal.</p></div><div className="preview-list">{rows.length ? rows.map(({ player, tier, marketUnits }) => <span key={player.id}><strong>{player.name}</strong> · {marketUnits ? `${units(marketUnits)} ${player.harvest!.mode} for market · ${tier}` : 'No crop left for the market'}</span>) : <span>No harvest is ready to sell this round.</span>}</div></section>
}

function PlayerRail({ game, activeId }: { game: GameState; activeId: string | null }) {
  return <section className="farmer-rail"><div className="section-heading"><h2>All farmers</h2><p>Public status · select a card for details</p></div><div className="farmer-grid">{game.players.map((player) => <article key={player.id} className={`farmer-card ${player.id === activeId ? 'active' : ''}`}>
    <div className="farmer-heading"><h3>{player.name}</h3><strong>{money(player.cash)}</strong></div>{player.id === activeId && <span className="active-tag">Current turn</span>}<p className="role-title">{player.role}</p><p className="role-progress">{roleProgress(player)}</p><p className="farm-status">{statusLabel(player, game.round)} · {player.coop ? 'Co-op' : 'Independent'}</p>
    <details className="farmer-details"><summary>Farm details</summary><p>{roleInstruction(player.role)}</p><dl><div><dt>Sale inventory</dt><dd>{player.harvest ? `${units(player.harvest.units)} ${player.harvest.mode}` : 'None'}</dd></div><div><dt>Operating cost</dt><dd>{money(farmOperatingCost(player))}</dd></div><div><dt>Contracts</dt><dd>{player.contracts.length ? player.contracts.map((contract) => `${contract.quantity} due R${contract.dueRound}`).join(', ') : 'None'}</dd></div></dl><MiniLandGrid land={player.land} /></details>
  </article>)}</div></section>
}

function MiniLandGrid({ land }: { land: Player['land'] }) {
  return <div className="mini-land" aria-label="Land state">{land.map((plot) => <span className={plot.state} title={title(plot.state.replace('-', ' '))} key={plot.id}>{plot.kind === 'base' ? 'B' : 'C'}</span>)}</div>
}

function roleProgress(player: Player): string {
  if (player.role === 'Community Anchor') return `${units(player.metrics.affordableLocalSales)} / 3 Affordable Local sales`
  if (player.role === 'Organic Pioneer') return `${units(player.metrics.organicUnitsSold)} / 3 organic sales through any channel`
  if (player.role === 'Independent') return player.coop ? 'Role blocked: joined co-op' : `${money(player.cash)} / more than ${money(player.startingCash)}`
  return `${player.metrics.contractsFulfilled} / 2 fulfilled · ${player.metrics.contractsSigned} signed`
}

function Resolution({ game, onNext }: { game: GameState; onNext: () => void }) {
  const resolution = game.resolution!
  const sold = resolution.lines.reduce((sum, line) => sum + line.contractUnits + line.marketUnits, 0)
  const spoilage = resolution.lines.reduce((sum, line) => sum + line.spoilage, 0)
  return <section className="resolution" aria-labelledby="screen-heading"><div className="resolution-heading"><div><p className="eyebrow">Round {game.round} results</p><h2 id="screen-heading" tabIndex={-1}>{resolution.demand?.label ?? 'First harvest is growing'}</h2><p>{resolution.note}</p></div>{resolution.shock && <div className="shock-box"><strong>Shock</strong><span>{title(resolution.shock)}</span></div>}</div>
    {resolution.crisisImpact && <CrisisPanel game={game} />}
    <div className="outcome-stats"><div><strong>{units(sold)}</strong><span>Sold, including contracts</span></div><div><strong>{units(spoilage)}</strong><span>Unsold crop</span></div>{game.votePlayerIds.length > 0 && <div><strong>{title(winningCoopTier(game))}</strong><span>Co-op price tier</span></div>}</div>
    <h3>What happened to each farmer</h3><div className="outcome-list">{game.players.map((player) => { const line = resolution.lines.find((entry) => entry.playerId === player.id)!; const tier = player.coop ? winningCoopTier(game) : game.plans[player.id].saleTier; const hadMarketCrop = line.marketUnits + line.spoilage > 0; const priceOutcome = hadMarketCrop && resolution.shock === 'marketClosure' ? 'Market closed' : hadMarketCrop && tier ? `${title(tier)} price chosen` : 'No market offer'; return <div className="outcome-row" key={player.id}><strong>{player.name}</strong><span>{priceOutcome}</span><span>{units(line.contractUnits + line.marketUnits)} sold{line.contractUnits ? ` (${units(line.contractUnits)} by contract)` : ''}{line.contractShortfall ? ` · ${units(line.contractShortfall)} short` : ''}</span><span>{units(line.spoilage)} unsold</span><strong className={line.revenue - line.costs < 0 ? 'negative' : 'positive'}>{signedMoney(line.revenue - line.costs)} cash</strong></div> })}</div>
    <details className="detail-panel"><summary>See demand charts and full round audit</summary>{resolution.markets.length ? <div className="market-charts">{resolution.markets.map((market) => <MarketChart key={market.mode} market={market} />)}</div> : <p className="empty-resolution">No open-market chart is available this round.</p>}<AuditTable game={game} /></details>
    <button className="primary advance" onClick={onNext}>{game.round === ROUND2_CONFIG.rounds ? 'Open group debrief' : 'Start next round'}</button>
  </section>
}

function CrisisPanel({ game }: { game: GameState }) {
  const impact = game.resolution!.crisisImpact!
  return <section className="crisis-panel"><strong>Impact: {impact.headline}</strong>{impact.playerImpacts.length > 0 && <div>{impact.playerImpacts.filter((entry) => entry.growingCropsLost || entry.openMarketBlocked).map((entry) => { const player = game.players.find((item) => item.id === entry.playerId)!; return <span key={entry.playerId}>{player.name}: {entry.growingCropsLost ? `${units(entry.growingCropsLost)} growing crop lost` : ''}{entry.growingCropsLost && entry.openMarketBlocked ? ' · ' : ''}{entry.openMarketBlocked ? `${units(entry.openMarketBlocked)} open-market crop blocked` : ''}</span> })}</div>}</section>
}

function MarketChart({ market }: { market: MarketSnapshot }) {
  const total = combinedDemand(market.demand)
  return <article className="market-chart"><header><p className="card-kicker">{title(market.mode)} market</p><h3>{market.mode === 'conventional' ? 'Affordable / Standard demand' : 'Local and Tourist demand combined'}</h3></header><div className="chart-legend"><span>Demand by willingness to pay</span><span>Visible supply by chosen price</span></div><div className="bar-comparison"><StackBar label="Demand" values={total} /><div className="source-brackets">{(['local', 'tourist'] as const).map((source) => <span key={source}>↳ {title(source)}: {units(TIERS.reduce((sum, tier) => sum + market.demand[source][tier], 0))}</span>)}</div><SupplyBar supply={market.supplyByTier} sold={market.soldByTier} /></div><p className="chart-note">Supply segments align with their offered tier; gaps show supply priced above lower tiers.</p></article>
}

function StackBar({ label, values }: { label: string; values: Record<Tier, number> }) {
  return <div className="vertical-bar"><strong>{label}</strong><div className="tier-scale">{[...TIERS].reverse().map((tier) => <div className={`tier-row ${tier}`} key={tier}>{values[tier] > 0 && <div className={`bar-segment ${tier}`} style={{ height: `${Math.max(22, values[tier] * 13)}px` }}><span>{values[tier]}</span><small>{title(tier)}</small></div>}</div>)}</div></div>
}

function SupplyBar({ supply, sold }: { supply: Record<Tier, number>; sold: Record<Tier, number> }) {
  return <div className="vertical-bar"><strong>Supply</strong><div className="tier-scale">{[...TIERS].reverse().map((tier) => <div className={`tier-row ${tier}`} key={tier}>{supply[tier] > 0 && <div className={`bar-segment ${tier}`} style={{ height: `${Math.max(22, supply[tier] * 13)}px` }}><span>{supply[tier]}</span><small>{sold[tier]} sold</small></div>}</div>)}</div></div>
}

function AuditTable({ game }: { game: GameState }) {
  return <div className="audit"><h3>Round audit</h3><div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Contract</th><th>Local</th><th>Tourist</th><th>Spoilage</th><th>Revenue</th><th>Farm cost</th><th>Cash</th></tr></thead><tbody>{game.players.map((player) => { const line = game.resolution!.lines.find((entry) => entry.playerId === player.id)!; return <tr key={player.id}><td>{player.name}</td><td>{units(line.contractUnits)}{line.contractShortfall ? ` · ${units(line.contractShortfall)} short` : ''}</td><td>{units(line.localUnits)}</td><td>{units(line.touristUnits)}</td><td>{units(line.spoilage)}</td><td>{money(line.revenue)}</td><td>{money(line.costs)}</td><td>{money(player.cash)}</td></tr> })}</tbody></table></div></div>
}

function Debrief({ game }: { game: GameState }) {
  const total = (key: 'affordableLocalSales' | 'touristSales' | 'totalSpoilage' | 'contractsFulfilled') => game.players.reduce((sum, player) => sum + player.metrics[key], 0)
  return <section className="debrief"><p className="eyebrow">Five-round outcome</p><h2 id="screen-heading" tabIndex={-1}>Group debrief</h2><div className="metric-grid"><div><strong>{units(total('affordableLocalSales'))}</strong><span>Affordable Local sales</span></div><div><strong>{units(total('touristSales'))}</strong><span>Tourist sales</span></div><div><strong>{units(total('totalSpoilage'))}</strong><span>Spoilage</span></div><div><strong>{total('contractsFulfilled')}</strong><span>Contracts fulfilled</span></div></div><div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Public goal</th><th>Outcome</th><th>Progress</th></tr></thead><tbody>{game.players.map((player) => <tr key={player.id}><td>{player.name}</td><td>{roleInstruction(player.role)}</td><td>{rolePassed(player) ? 'Met condition' : 'Not met'}</td><td>{roleProgress(player)}</td></tr>)}</tbody></table></div><p className="discussion">Discuss: Which price choices were exposed by demand? Did the co-op’s shared price help or constrain its members? Was the $6 organic farm cost worth the delayed output?</p></section>
}

export default App
