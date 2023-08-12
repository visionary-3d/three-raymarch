// typescript fix by matt pocock
import '@total-typescript/ts-reset'

// styles
import '@/styles/index.scss'

// engine
import { initEngine } from './render/init'

// app
import startApp from './app'

(async () => {
  await initEngine()
  await startApp()
})()
