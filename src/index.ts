import { logger } from './logger'
import { network } from './network'
import { chainManager } from './chain'

const BIND_PORT = 18018
const BIND_IP = '0.0.0.0'

logger.info(`Malibu - A Marabu node`)
logger.info(`Dionysis Zindros <dionyziz@stanford.edu>`)

chainManager.init()
network.init(BIND_PORT, BIND_IP)
