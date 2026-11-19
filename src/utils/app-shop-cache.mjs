import { createTimedResource } from './timed-resource.mjs'

export const appShopCatalog = createTimedResource(60_000)
export const appShopPoints = createTimedResource(15_000)
