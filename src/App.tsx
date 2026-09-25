import { useMemo, useState } from 'react'
import { ROUND2_CONFIG } from './round2/config'
import { advanceConfirming, advancePlanning, advanceRound, advanceVoting, combinedDemand, conversionRoundsLeft, createGame, farmOperatingCost, forecastHarvest, phaseLabel, previewLandPlots, roleInstruction, rolePassed, updatePlan, updateVote, winningCoopTier } from './round2/engine'
import { GameState, MarketSnapshot, Player, Tier, TIERS } from './round2/types'

const title = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
const money = (value: number) => `$${value.toFixed(2)}`
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
    if (game.phase === 'planning' || game.phase === 'confirming') return game.players[game.activePlayerIndex]
    if (game.phase === 'voting') return game.players.find((player) => player.id === game.votePlayerIds[game.activePlayerIndex]) ?? null
    return null
  }, [game])

  const transition = (action: (state: GameState) => GameState) => {
    try {
      setError(null)
      setGame((state) => state ? action(state) : state)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That action could not be completed.')
    }
  }

  if (!game) return <Setup names={names} setNames={setNames} start={() => setGame(createGame(names))} />

  const plan = activePlayer ? game.plans[activePlayer.id] : null
  return <main className="round-two-shell">
    <header className="r2-header">
      <div><p className="eyebrow">Round 2 mechanics prototype · shared screen</p><h1>Food Resilience Market</h1></div>
      <div className="phase-pill"><strong>Round {game.round} / {ROUND2_CONFIG.rounds}</strong><span>{phaseLabel(game.phase)}</span></div>
      <button className="quiet" onClick={() => { setGame(null); setError(null) }}>New game</button>
    </header>

    <section className="phase-guide" aria-label="Round sequence"><span className={game.phase === 'planning' ? 'current' : ''}>1. Plan</span><span className={game.phase === 'confirming' ? 'current' : ''}>2. Lock</span><span className={game.phase === 'voting' ? 'current' : ''}>3. Co-op vote</span><span className={game.phase === 'resolution' ? 'current' : ''}>4. Reveal & sell</span></section>
    {error && <p className="error" role="alert">{error}</p>}

    {(game.phase === 'planning' || game.phase === 'confirming') && activePlayer && plan && <PlanningWorkspace game={game} player={activePlayer} onChange={(patch) => transition((state) => updatePlan(state, activePlayer.id, patch))} onAdvance={() => transition(game.phase === 'planning' ? advancePlanning : advanceConfirming)} />}
    {game.phase === 'voting' && activePlayer && <VoteWorkspace game={game} player={activePlayer} onVote={(tier) => transition((state) => updateVote(state, activePlayer.id, tier))} onAdvance={() => transition(advanceVoting)} />}
    {game.phase === 'resolution' && game.resolution && <Resolution game={game} onNext={() => transition(advanceRound)} />}
    {game.phase === 'debrief' && <Debrief game={game} />}

    {(game.phase === 'planning' || game.phase === 'confirming' || game.phase === 'voting') && <MarketPreview game={game} />}
    <PlayerRail game={game} activeId={activePlayer?.id ?? null} />
  </main>
}

function Setup({ names, setNames, start }: { names: string[]; setNames: (names: string[]) => void; start: () => void }) {
  return <main className="setup-shell"><section className="setup-panel">
    <p className="eyebrow">Single crop · two markets · five players</p><h1>Food Resilience Market</h1>
    <p className="lead">A plain shared-screen simulation. The meaningful choices are conversion, co-op membership, contracts, and pricing the harvest already available to sell.</p>
    <div className="name-grid">{names.map((name, index) => <label key={index}>Player {index + 1}<input value={name} onChange={(event) => setNames(names.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /></label>)}</div>
    <div className="rule-list"><span>Each usable plot grows one crop automatically.</span><span>Organic conversion blocks base land for one round; farms cost $2 normally or $6 with organic land ready.</span><span>Co-op adds one immediate organic plot, contracts, and a shared price vote.</span></div>
    <button className="primary" onClick={start}>Start five-round game</button>
  </section></main>
}

function PlanningWorkspace({ game, player, onChange, onAdvance }: { game: GameState; player: Player; onChange: (patch: Partial<GameState['plans'][string]>) => void; onAdvance: () => void }) {
  const plan = game.plans[player.id]
  const saleDisabled = !player.harvest || player.coop || plan.joinCoop
  const conversionPlanned = player.farmStatus === 'conventional' && (plan.startConversion || plan.joinCoop)
  const forecast = forecastHarvest(player, plan, game.round)
  const previewLand = previewLandPlots(player, plan)
  const titleText = game.phase === 'planning' ? `Planning: ${player.name}` : `Lock plan: ${player.name}`
  return <section className="workspace"><div className="workspace-heading"><div><p className="eyebrow">{game.phase === 'planning' ? 'Visible first pass' : 'Visible final pass'}</p><h2>{titleText}</h2><p>{game.phase === 'planning' ? 'Set a sale price for current inventory before demand is revealed, then decide the farm’s next-round status.' : 'Review the visible choices, then lock this farmer’s final plan.'}</p></div><div className="goal-box"><strong>{player.role}</strong><span>{roleInstruction(player.role)}</span></div></div>
    <div className="workspace-grid">
      <section className={`action-card ${saleDisabled ? 'disabled-card' : ''}`}><p className="card-kicker">A. Current harvest for sale</p><h3>Price this round’s inventory</h3>
        {player.harvest ? <><HarvestGrid player={player} plan={plan} />
          <p className="contract-note">Operating cost this round: <strong>{money(farmOperatingCost(player))}</strong> · {player.coop || player.farmStatus === 'organic' ? 'organic land is ready' : 'no organic land is ready yet'}</p>
          <label>Personal sale tier<select disabled={saleDisabled} value={plan.saleTier ?? ''} onChange={(event) => onChange({ saleTier: event.target.value as Tier })}><option value="">Choose a tier</option>{TIERS.map((tier) => <option key={tier} value={tier}>{title(tier)} · {money(ROUND2_CONFIG.prices[player.harvest!.mode][tier])}/unit</option>)}</select></label>
          {player.coop || plan.joinCoop ? <p className="disabled-message">Personal pricing is disabled: co-op output uses the shared tier chosen in the co-op vote.</p> : <p className="hint">Demand is hidden until every farmer locks a price.</p>}</> : <><p className="disabled-message">No crop is available for sale this round. Price controls are disabled.</p><p className="contract-note">Operating cost this round: <strong>{money(farmOperatingCost(player))}</strong></p></>}
      </section>
      <section className="action-card"><p className="card-kicker">B. Next-round growing</p><h3>Land and conversion</h3>
        <LandGrid land={previewLand} />
        {player.farmStatus === 'conventional' && !plan.joinCoop && <label className="check"><input type="checkbox" checked={plan.startConversion} onChange={(event) => onChange({ startConversion: event.target.checked })} /> Start organic conversion</label>}
        {!player.coop && <label className="check"><input type="checkbox" checked={plan.joinCoop} onChange={(event) => onChange({ joinCoop: event.target.checked })} /> Join co-op permanently</label>}
        {plan.joinCoop && <p className="decision-note">Joining forces one-round conversion: the 2 base plots are blocked this round. The new co-op plot grows organic crop immediately; personal price control is lost.</p>}
        {plan.startConversion && <p className="decision-note">Conversion blocks both base plots this round. They return as organic land next round; the farm still pays the normal $2 this round.</p>}
      </section>
      <section className="action-card"><p className="card-kicker">C. Institutional safety net</p><h3>Contract</h3>
        {player.contracts.length > 0 && <div className="contract-list">{player.contracts.map((contract) => <span key={contract.id}>{units(contract.quantity)} due R{contract.dueRound} · {money(contract.pricePerUnit)}/unit</span>)}</div>}
        {(player.coop || plan.joinCoop) && game.round < ROUND2_CONFIG.rounds && forecast ? <><label>New contract quantity<select value={plan.contractQuantity ?? ''} onChange={(event) => onChange({ contractQuantity: event.target.value ? Number(event.target.value) : null })}><option value="">No new contract</option>{Array.from({ length: forecast.units }, (_, index) => index + 1).map((quantity) => <option value={quantity} key={quantity}>{units(quantity)} due next round</option>)}</select></label><p className="hint">Forecast: {units(forecast.units)} {forecast.mode} crop. One contract may be added this round at {money(ROUND2_CONFIG.contractPrice)}/unit; shortfalls cost {money(ROUND2_CONFIG.contractShortfallPenalty)}.</p></> : <p className="disabled-message">Contracts require co-op membership, a forecast crop, and a due round before the final round.</p>}
      </section>
    </div>
    <button className="primary advance" onClick={onAdvance}>{game.phase === 'planning' ? 'Save visible plan → Player next' : 'Lock plan → Player next'}</button>
  </section>
}

function LandGrid({ land }: { land: Player['land'] }) {
  return <div className="asset-grid"><strong>Land for next sale round</strong><div className="plot-grid">{land.map((plot) => <div className={`plot ${plot.state}`} key={plot.id}><span>{plot.kind === 'base' ? 'Base land' : 'Co-op land'}</span><strong>{title(plot.state.replace('-', ' '))}</strong></div>)}</div><p className="hint">Colours show growing conventional, growing organic, conversion, or crisis damage.</p></div>
}

function HarvestGrid({ player, plan }: { player: Player; plan: GameState['plans'][string] }) {
  const reserved = player.contracts.filter((contract) => contract.dueRound).reduce((sum, contract) => sum + contract.quantity, 0)
  return <div className="asset-grid"><strong>Harvest ready now</strong><div className="harvest-grid"><span><b>{units(player.harvest!.units)}</b> ready</span><span>{title(player.harvest!.mode)}</span><span>{reserved ? `${units(reserved)} contract-reserved` : 'No contract reserved'}</span><span>{plan.saleTier ? `${title(plan.saleTier)} offer` : 'Shared co-op price'}</span></div></div>
}

function VoteWorkspace({ game, player, onVote, onAdvance }: { game: GameState; player: Player; onVote: (tier: Tier) => void; onAdvance: () => void }) {
  const selected = game.votes[player.id]
  return <section className="workspace vote-workspace"><div className="workspace-heading"><div><p className="eyebrow">Shared price decision</p><h2>Co-op vote: {player.name}</h2><p>All co-op harvests use one price tier this round. A tie resolves to Standard.</p></div><div className="goal-box"><strong>Current co-op output</strong><span>{player.harvest ? `${units(player.harvest.units)} ready to sell` : 'No personal harvest this round'}</span></div></div><div className="vote-options">{TIERS.map((tier) => <label className={selected === tier ? 'selected' : ''} key={tier}><input type="radio" name="coop-vote" checked={selected === tier} onChange={() => onVote(tier)} /> <strong>{title(tier)}</strong><span>{money(ROUND2_CONFIG.prices.organic[tier])}/organic unit</span></label>)}</div><button className="primary advance" onClick={onAdvance}>{game.activePlayerIndex === game.votePlayerIds.length - 1 ? 'Lock vote and reveal demand' : 'Save vote → Co-op member next'}</button></section>
}

function MarketPreview({ game }: { game: GameState }) {
  const rows = game.players.flatMap((player) => {
    if (!player.harvest) return []
    const tier = player.coop || game.plans[player.id]?.joinCoop ? 'Co-op vote pending' : title(game.plans[player.id]?.saleTier ?? 'not priced')
    return [{ player, tier }]
  })
  return <section className="market-preview"><div><p className="card-kicker">Market preview</p><h2>Supply is visible. Demand is not.</h2><p>Every farmer can see current sale inventory and selected prices before the demand card is revealed.</p></div><div className="preview-list">{rows.length ? rows.map(({ player, tier }) => <span key={player.id}><strong>{player.name}</strong> · {units(player.harvest!.units)} {player.harvest!.mode} · {tier}</span>) : <span>No farmer has a harvest to price in Round 1.</span>}</div></section>
}

function PlayerRail({ game, activeId }: { game: GameState; activeId: string | null }) {
  return <section className="farmer-rail"><h2>Public farm status</h2><div className="farmer-grid">{game.players.map((player) => <article key={player.id} className={`farmer-card ${player.id === activeId ? 'active' : ''}`}><div className="farmer-heading"><h3>{player.name}</h3><strong>{money(player.cash)}</strong></div><p className="role-title">{player.role}</p><p className="role-instruction">{roleInstruction(player.role)}</p><dl><div><dt>Farm</dt><dd>{statusLabel(player, game.round)}</dd></div><div><dt>Sale inventory</dt><dd>{player.harvest ? `${units(player.harvest.units)} ${player.harvest.mode}` : 'None'}</dd></div><div><dt>Operating cost</dt><dd>{money(farmOperatingCost(player))}</dd></div><div><dt>Co-op</dt><dd>{player.coop ? 'Member · shared price' : 'Independent'}</dd></div><div><dt>Contracts</dt><dd>{player.contracts.length ? player.contracts.map((contract) => `${contract.quantity} due R${contract.dueRound}`).join(', ') : 'None'}</dd></div></dl><MiniLandGrid land={player.land} /><p className="role-progress">{roleProgress(player)}</p></article>)}</div></section>
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
  return <section className="resolution"><div className="resolution-heading"><div><p className="eyebrow">Demand revealed</p><h2>{resolution.demand?.label ?? 'First harvest is growing'}</h2><p>{resolution.note}</p></div><div className="shock-box"><strong>Shock</strong><span>{resolution.shock ? title(resolution.shock) : 'None'}</span></div></div>
    {resolution.crisisImpact && <CrisisPanel game={game} />}
    {resolution.markets.length ? <div className="market-charts">{resolution.markets.map((market) => <MarketChart key={market.mode} market={market} />)}</div> : <p className="empty-resolution">No sale market in Round 1. The crop planted this round becomes visible sale inventory in Round 2.</p>}
    <AuditTable game={game} />
    {game.votePlayerIds.length > 0 && <p className="hint">Co-op elected {title(winningCoopTier(game))} for this round.</p>}
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
  return <div className="audit"><h3>Round audit</h3><div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Contract</th><th>Local</th><th>Tourist</th><th>Spoilage</th><th>Revenue</th><th>Organic cost</th><th>Cash</th></tr></thead><tbody>{game.players.map((player) => { const line = game.resolution!.lines.find((entry) => entry.playerId === player.id)!; return <tr key={player.id}><td>{player.name}</td><td>{units(line.contractUnits)}{line.contractShortfall ? ` · ${units(line.contractShortfall)} short` : ''}</td><td>{units(line.localUnits)}</td><td>{units(line.touristUnits)}</td><td>{units(line.spoilage)}</td><td>{money(line.revenue)}</td><td>{money(line.costs)}</td><td>{money(player.cash)}</td></tr> })}</tbody></table></div></div>
}

function Debrief({ game }: { game: GameState }) {
  const total = (key: 'affordableLocalSales' | 'touristSales' | 'totalSpoilage' | 'contractsFulfilled') => game.players.reduce((sum, player) => sum + player.metrics[key], 0)
  return <section className="debrief"><p className="eyebrow">Five-round outcome</p><h2>Group debrief</h2><div className="metric-grid"><div><strong>{units(total('affordableLocalSales'))}</strong><span>Affordable Local sales</span></div><div><strong>{units(total('touristSales'))}</strong><span>Tourist sales</span></div><div><strong>{units(total('totalSpoilage'))}</strong><span>Spoilage</span></div><div><strong>{total('contractsFulfilled')}</strong><span>Contracts fulfilled</span></div></div><div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Public goal</th><th>Outcome</th><th>Progress</th></tr></thead><tbody>{game.players.map((player) => <tr key={player.id}><td>{player.name}</td><td>{roleInstruction(player.role)}</td><td>{rolePassed(player) ? 'Met condition' : 'Not met'}</td><td>{roleProgress(player)}</td></tr>)}</tbody></table></div><p className="discussion">Discuss: Which price choices were exposed by demand? Did the co-op’s shared price help or constrain its members? Was the $6 conversion cost worth the delayed organic output?</p></section>
}

export default App
