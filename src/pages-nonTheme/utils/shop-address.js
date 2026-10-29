/*
Region catalogue: uiwjs/province-city-china, a708f0df0ebdb68f09f5fcf6345367f7d5e9a7dc (2021-03-22 data snapshot).
MIT License

Copyright (c) 2019 wabg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import regions from './shop-regions.js'

const value = text => String(text || '').trim()
const placeholders = /^(市辖区|县|省直辖县级行政区划|自治区直辖县级行政区划)$/
const paths = regions.flatMap(province => province.children.flatMap(city => city.children.map(district => ({ province: province.name, city: city.name, district: district.name }))))
const unique = names => [...new Set(names)]
const one = names => { const list = unique(names); return list.length === 1 ? list[0] : '' }
const provinceAlias = name => value(name).replace(/(?:壮族|回族|维吾尔)?自治区$|特别行政区$|省$|市$/, '')

export function shopRegionText(region = []) {
  return region.map(value).filter((name, index, names) => name && !placeholders.test(name) && names.indexOf(name) === index).join('')
}

// Geocoders disagree about city/county levels. Only catalogue-confirmed names may become regions.
// Unknown text stays in the detail instead of guessing from suffixes such as a campus's “校区”.
export function splitShopAddress(address, parts = {}) {
  const full = value(address)
  const text = full.replace(/\s+/g, '')
  const hints = Object.values(parts).filter(item => typeof item === 'string').map(value)
  const provinceHints = [value(parts.province), value(parts.state)]
  let province = regions.find(item => provinceHints.some(hint => hint && provinceAlias(item.name) === provinceAlias(hint)))?.name || ''
  if (!province) province = one(regions.filter(item => text.includes(item.name)).map(item => item.name))
  let scope = province ? paths.filter(item => item.province === province) : paths
  const explicitCities = [parts.city, parts.prefecture, parts.municipality].map(value).filter(Boolean)
  let city = one(scope.filter(item => explicitCities.includes(item.city)).map(item => item.city))
  if (!city) city = one(scope.filter(item => text.includes(item.city)).map(item => item.city))
  if (city) scope = scope.filter(item => item.city === city)
  let district = one(scope.filter(item => hints.includes(item.district)).map(item => item.district))
  if (!district) district = one(scope.filter(item => text.includes(item.district)).map(item => item.district))
  if (district) {
    const matched = scope.filter(item => item.district === district)
    if (!city) city = one(matched.map(item => item.city))
    if (!province) province = one(matched.map(item => item.province))
    // A common district name alone cannot identify a parent city/province.
    if (!city || !province) district = ''
  }
  if (city && !province) province = one(paths.filter(item => item.city === city).map(item => item.province))
  if (province && !city && /^(北京|天津|上海|重庆)市$/.test(province)) city = province
  const region = [province, city, district]
  let detail = full
  if (full.includes(',') || full.includes('，')) {
    const excluded = new Set([...region, value(parts.country), value(parts.postcode)].filter(Boolean))
    const remaining = full.split(/[,，]/).map(value).filter(part => part && !excluded.has(part))
    // Keep roads and house numbers adjacent without discarding school/community/place names.
    const road = value(parts.road || parts.pedestrian)
    const number = value(parts.house_number)
    if (road && number && remaining.includes(road) && remaining.includes(number)) {
      const suffix = /^\d+(?:-\d+)?$/.test(number) && /[\u3400-\u9fff]/.test(road) ? '号' : ''
      detail = road + number + suffix + remaining.filter(part => part !== road && part !== number).join('，')
    } else detail = remaining.join('，')
  } else {
    for (const name of region.filter(Boolean)) {
      if (detail.startsWith(name)) detail = detail.slice(name.length).trim()
    }
  }
  return { region, detail }
}

export function composeShopAddress(region, detail) {
  const prefix = shopRegionText(region)
  const text = value(detail)
  return prefix + (prefix && text.startsWith(prefix) ? text.slice(prefix.length).trim() : text)
}
