import { startLocalMapServer as start, stopLocalMapServer as stop } from '@/uni_modules/ftx-map-local-server'
import { createAppMapServerPool } from './app-map-server-pool.mjs'

const pool = createAppMapServerPool({ start, stop })
export const startLocalMapServer = () => pool.acquire()
export const stopLocalMapServer = url => pool.release(url)
export const disposeLocalMapServerPool = () => pool.dispose()
