import { TUNING } from './config';
import { getCharacter } from './characters';
import { UPGRADE_VALUES, type UpgradeLevels } from './upgrades';
import { META_VALUES, type MetaLevels } from './meta';
import type { CharacterId, ModifierId, PlayerStats } from './types';

/** Derives the effective player stats from character + permanent upgrades + run upgrades + modifiers. */
export function computeStats(
  characterId: CharacterId,
  meta: MetaLevels,
  up: UpgradeLevels,
  modifiers: readonly ModifierId[],
  bonus: { hearts?: number; shardMul?: number; scoreMul?: number } = {},
): PlayerStats {
  const c = getCharacter(characterId);
  const lv = (k: keyof UpgradeLevels) => up[k] ?? 0;
  const m = (k: keyof MetaLevels) => meta[k] ?? 0;

  let trailLength = TUNING.trail.length * c.trailMul * (1 + 0.08 * m('trail')) * (1 + UPGRADE_VALUES.trail(lv('trail')));
  let trailLife = TUNING.trail.life * c.lifeMul * (1 + UPGRADE_VALUES.afterglow(lv('afterglow')));
  if (modifiers.includes('longtrail')) {
    trailLength *= 1.5;
    trailLife *= 0.7;
  }
  let maxHearts = TUNING.player.hearts + c.heartsDelta + m('heart') + lv('heart') + (bonus.hearts ?? 0);
  if (modifiers.includes('nopulse')) maxHearts += 1;
  if (modifiers.includes('glass')) maxHearts = 1;

  const pulseLevel = lv('pulsecharge');
  return {
    speed: TUNING.player.speed,
    hitRadius: TUNING.player.hitRadius * c.hitMul * UPGRADE_VALUES.nimble(lv('nimble')),
    trailLength,
    trailLife,
    magnet: TUNING.magnet * (1 + 0.15 * m('magnet')) * (1 + UPGRADE_VALUES.magnet(lv('magnet'))),
    maxHearts,
    shardMul: c.shardMul * (1 + 0.1 * m('shards')) * (1 + UPGRADE_VALUES.shardrain(lv('shardrain'))) * (modifiers.includes('glass') ? 2 : 1) * (bonus.shardMul ?? 1),
    scoreMul: c.scoreMul * (1 + UPGRADE_VALUES.stardust(lv('stardust'))) * (1 + META_VALUES.score(m('score'))) * (bonus.scoreMul ?? 1),
    comboWindow: TUNING.combo.window + UPGRADE_VALUES.combo(lv('combo')) + META_VALUES.combo(m('combo')),
    loopDamage: 1 + lv('double'),
    shockwave: lv('shockwave') + c.innateShockwave,
    frost: lv('frost') + c.innateFrost,
    chain: lv('chain') + c.innateChain + (lv('storm') ? 2 : 0),
    echo: lv('echo') + c.innateEcho,
    slowmo: lv('slowmo'),
    ember: lv('ember') + c.innateEmber,
    pulseLevel,
    pulseRadius: (TUNING.pulse.radius + TUNING.pulse.perLevelRadius * pulseLevel) * c.pulseRadiusMul,
    pulseGain: (1 + 0.3 * pulseLevel) * c.pulseGainMul,
    shield: lv('shield'),
    secondWind: lv('secondwind') > 0 || c.secondWind,
    phase: c.phase,
    treasure: UPGRADE_VALUES.treasure(lv('treasure')),
    retaliate: lv('retaliate') > 0,
    maxPulse: 1 + lv('doublepulse'),
    magnetTrail: lv('magnettrail') > 0,
    supernovaEvery: UPGRADE_VALUES.supernovaEvery(lv('supernova')),
    healLoop: lv('healloop') > 0,
    pierce: lv('pierce') > 0,
    storm: lv('storm') > 0,
    starfrost: lv('starfrost') > 0,
    phoenix: lv('phoenix') > 0,
    gravity: lv('gravity'),
    orbiters: lv('orbit') > 0 ? lv('orbit') + 1 + (lv('galaxy') ? 2 : 0) : 0,
    orbitRadius: UPGRADE_VALUES.orbitRadius(lv('galaxy')),
    galaxy: lv('galaxy') > 0,
    startEpic: c.startEpic,
    cometCharge: c.cometCharge,
    noPulse: modifiers.includes('nopulse'),
  };
}
