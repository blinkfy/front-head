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
