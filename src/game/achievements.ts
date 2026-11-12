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
  | 'daily';

export const ACHIEVEMENTS: AchievementId[] = [
  'first_loop', 'multi5', 'multi10', 'combo10', 'pulse5',
  'wave5', 'wave10', 'wave15', 'wave20', 'flawless5',
  'boss_maw', 'boss_weaver', 'boss_twins',
  'score10k', 'score50k', 'shards1000', 'all_chars', 'daily',
];
