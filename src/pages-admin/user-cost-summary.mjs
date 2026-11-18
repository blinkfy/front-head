const fields = ['qwenCost', 'deepseekCost', 'imageCost', 'speechCost', 'identityCost']

export function withUserCostTotal(row) {
    // Sum decimal values in 1e-8 yuan units to avoid floating point display noise.
    const units = fields.reduce((sum, key) => sum + Math.round((Number(row[key]) || 0) * 1e8), 0)
    return { userId: row.userId, totalCost: (units / 1e8).toFixed(8), ...row }
}
