// The API retains source coordinates and supplies SDK-ready coordinates separately.
// Admin forms use sourceLatitude/sourceLongitude so saving text never shifts a point.
export function toMapDisplayPoint(point) {
  if (!point || point.mapLatitude == null || point.mapLongitude == null) return point
  const latitude = Number(point.mapLatitude)
  const longitude = Number(point.mapLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return point
  return { ...point, sourceLatitude: point.sourceLatitude ?? point.latitude,
    sourceLongitude: point.sourceLongitude ?? point.longitude, latitude, longitude }
}

export function mapPointDescription(point, description = point?.description) {
  if (typeof description !== 'string') return ''
  if (point?.sharedLocation) return description
  const visible = description.replace(/^[\t ]*(?:来源|数据来源|点位来源)[\t ]*[:：][\t ]*([^\r\n]*)(?:\r?\n|$)/gmu,
    (line, source) => point?.sourceKey || /^(?:腾讯地图|深圳市政府数据开放平台|OpenStreetMap\b)/iu.test(source) ? '' : line)
  return visible === description ? description : visible.trimEnd()
}
