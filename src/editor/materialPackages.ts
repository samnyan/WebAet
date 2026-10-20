import type { ComputedRef, InjectionKey } from 'vue'
import type { MaterialPackage } from './materialPicker'
export const materialPackagesKey: InjectionKey<ComputedRef<MaterialPackage[]>> = Symbol('material-packages')
