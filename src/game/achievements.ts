export type AchievementId =
  | 'first_loop'
  | 'multi5'
  | 'multi10'
  | 'wave5'
  | 'wave10'
  | 'wave15'
  | 'wave20'
  | 'boss_maw'
  | 'boss_weaver'
  | 'boss_twins'
  | 'combo10'
  | 'flawless5'
  | 'pulse5'
  | 'score10k'
  | 'score50k'
  | 'shards1000'
  | 'all_chars'
  | 'daily'
  | 'wave30'
  | 'wave50'
  | 'boss_hydra'
  | 'boss_eye'
  | 'level10'
  | 'level25'
  | 'revived'
  | 'shopper'
  | 'legend'
  | 'level50'
  | 'galaxy';

export const ACHIEVEMENTS: AchievementId[] = [
  'first_loop', 'multi5', 'multi10', 'combo10', 'pulse5',
  'wave5', 'wave10', 'wave15', 'wave20', 'wave30', 'wave50', 'flawless5',
  'boss_maw', 'boss_weaver', 'boss_twins', 'boss_hydra', 'boss_eye',
  'score10k', 'score50k', 'shards1000', 'all_chars', 'daily',
  'level10', 'level25', 'level50', 'revived', 'shopper', 'legend', 'galaxy',
];
