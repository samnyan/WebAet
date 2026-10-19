import type { Composition } from '../core/aet/types'

const names = ['rhythmgame', 'custom', 'playlist', 'gallery', 'eshop', 'option'] as const

/** Recognize the complete MegaMix menu group, not arbitrary similarly named layers. */
export function menuCharacterBranches(composition: Composition | null | undefined) {
  const branches = names.map(name => composition?.layers.find(layer => layer.itemType === 3 && layer.name === `chara_mainmenu_${name}`))
  return branches.every(Boolean) ? branches.map((layer, i) => ({ value: layer!.offset, label: names[i]!, layer: layer! })) : []
}

/** Only replace group visibility; preserve unrelated temporary hiding. */
export function menuCharacterVisibility(composition: Composition, hidden: ReadonlySet<number>, selected: number | null): Set<number> {
  const branches = menuCharacterBranches(composition)
  if (!branches.length || (selected !== null && !branches.some(branch => branch.value === selected))) throw new Error('Invalid menu character preview')
  const result = new Set(hidden)
  for (const branch of branches) {
    if (selected === null || branch.value === selected) result.delete(branch.value)
    else result.add(branch.value)
  }
  return result
}
