import { TUNING } from './config';
import { getCharacter } from './characters';
import { UPGRADE_VALUES, type UpgradeLevels } from './upgrades';
import type { MetaLevels } from './meta';
import type { CharacterId, ModifierId, PlayerStats } from './types';

/** Derives the effective player stats from character + permanent upgrades + run upgrades + modifiers. */
export function computeStats(
  characterId: CharacterId,
  meta: MetaLevels,
  up: UpgradeLevels,
  modifiers: readonly ModifierId[],
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
  let maxHearts = TUNING.player.hearts + c.heartsDelta + m('heart') + lv('heart');
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
    shardMul: (1 + 0.1 * m('shards')) * (1 + UPGRADE_VALUES.shardrain(lv('shardrain'))) * (modifiers.includes('glass') ? 2 : 1),
    scoreMul: c.scoreMul,
    comboWindow: TUNING.combo.window + UPGRADE_VALUES.combo(lv('combo')),
    loopDamage: 1 + lv('double'),
    shockwave: lv('shockwave'),
    frost: lv('frost'),
    chain: lv('chain') + c.innateChain,
    echo: lv('echo'),
    slowmo: lv('slowmo'),
    ember: lv('ember') + c.innateEmber,
    pulseLevel,
    pulseRadius: TUNING.pulse.radius + TUNING.pulse.perLevelRadius * pulseLevel,
    pulseGain: 1 + 0.3 * pulseLevel,
    shield: lv('shield'),
    secondWind: lv('secondwind') > 0,
    cometCharge: c.cometCharge,
    noPulse: modifiers.includes('nopulse'),
  };
}
