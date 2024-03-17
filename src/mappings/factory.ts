import { WHITELIST_TOKENS } from './../utils/pricing'
/* eslint-disable prefer-const */
import { FACTORY_ADDRESS, ZERO_BI, ONE_BI, ZERO_BD, ADDRESS_ZERO } from './../utils/constants'
import { Factory } from '../types/schema'
import { PoolCreated } from '../types/Factory/Factory'
import { Pool, Token, Bundle } from '../types/schema'
import { Pool as PoolTemplate } from '../types/templates'
import { fetchTokenSymbol, fetchTokenName, fetchTokenDecimals } from '../utils/token'
import { log, BigInt } from '@graphprotocol/graph-ts'

export function handlePoolCreated(event: PoolCreated): void {
  // load factory
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory === null) {
    factory = new Factory(FACTORY_ADDRESS)
    factory.poolCount = ZERO_BI
    factory.txCount = ZERO_BI
    factory.owner = ADDRESS_ZERO

    // create new bundle for tracking eth price
    let bundle = new Bundle('1')
    bundle.ethPriceUSD = ZERO_BD
    bundle.save()
  }

  factory.poolCount = factory.poolCount.plus(ONE_BI)

  let pool = new Pool(event.params.pool.toHexString()) as Pool
  let token0 = Token.load(event.params.token0.toHexString())
  let token1 = Token.load(event.params.token1.toHexString())

  // fetch info if null
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHexString())
    token0.symbol = fetchTokenSymbol(event.params.token0)
    token0.name = fetchTokenName(event.params.token0)
    let decimals = fetchTokenDecimals(event.params.token0)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.error('Unexpected: the decimal on token 0 was null', [])
      return
    }

    token0.decimals = decimals
    token0.derivedETH = ZERO_BD
    token0.txCount = ZERO_BI
    token0.poolCount = ZERO_BI
    token0.whitelistPools = []
  }

  if (token1 === null) {
    token1 = new Token(event.params.token1.toHexString())
    token1.symbol = fetchTokenSymbol(event.params.token1)
    token1.name = fetchTokenName(event.params.token1)
    let decimals = fetchTokenDecimals(event.params.token1)
    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.error('Unexpected: the decimal on token 0 was null', [])
      return
    }
    token1.decimals = decimals
    token1.derivedETH = ZERO_BD
    token1.txCount = ZERO_BI
    token1.poolCount = ZERO_BI
    token1.whitelistPools = []
  }

  // update white listed pools
  if (WHITELIST_TOKENS.includes(token0.id)) {
    let newPools = token1.whitelistPools
    newPools.push(pool.id)
    token1.whitelistPools = newPools
  }

  
  if (WHITELIST_TOKENS.includes(token1.id)) {
    let newPools = token0.whitelistPools
    newPools.push(pool.id)
    token0.whitelistPools = newPools
  }

  pool.token0 = token0.id
  pool.token1 = token1.id
  pool.feeTier = BigInt.fromI32(event.params.fee)
  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number
  pool.txCount = ZERO_BI
  pool.liquidity = ZERO_BI
  pool.sqrtPrice = ZERO_BI
  pool.token0Price = ZERO_BD
  pool.token1Price = ZERO_BD
  pool.totalValueLockedToken0 = ZERO_BD
  pool.totalValueLockedToken1 = ZERO_BD

  pool.save()
  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool)
  token0.save()
  token1.save()
  factory.save()
}
