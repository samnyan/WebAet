import type { Scene } from '../aet/types'
import { createSceneEvaluator, type Evaluation } from './evaluate'

/** Explicit runtime objects in back-to-front draw order; never serialized as AET edits. */
export interface PreviewInstance {
  composition: number
  frame: number
  branch: number | null
  hidden?: ReadonlySet<number>
}

/**
 * Independent object clocks, transforms and matte state. Recreate on scene revision,
 * just like createSceneEvaluator. The caller owns controller state and draw order;
 * this does not infer a game's menu behavior from layer names.
 */
export function createInstanceEvaluator(scene: Scene) {
  const evaluate = createSceneEvaluator(scene)
  return (instances: readonly PreviewInstance[]): Evaluation => {
    const items: Evaluation['items'] = [], warnings = new Set<string>()
    for (const instance of instances) {
      const result = evaluate(instance.composition, instance.frame, instance.hidden, instance.branch)
      items.push(...result.items)
      for (const warning of result.warnings) warnings.add(warning)
    }
    return { items, warnings: [...warnings] }
  }
}
