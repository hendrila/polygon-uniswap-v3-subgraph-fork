/* eslint-disable prefer-const */
import { Bundle, Factory, Pool, Token } from '../types/schema'
import { BigInt, log } from '@graphprotocol/graph-ts'
import {
  Burn as BurnEvent,
  Initialize,
  Mint as MintEvent,
  Swap as SwapEvent
} from '../types/templates/Pool/Pool'
import { convertTokenToDecimal } from '../utils'
import { FACTORY_ADDRESS, ONE_BI } from '../utils/constants'
import { findEthPerToken, getEthPriceInUSD, sqrtPriceX96ToTokenPrices } from '../utils/pricing'

export function handleInitialize(event: Initialize): void {
  // update pool sqrt price and tick
  let pool = Pool.load(event.address.toHexString())

  if (pool === null) {
    log.error("Could not load pool!", [])
    return
  }
  
  pool.sqrtPrice = event.params.sqrtPriceX96
  pool.tick = BigInt.fromI32(event.params.tick)
  pool.save()
  
  // update token prices
  let token0 = Token.load(pool.token0)
  let token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null) {
    log.error("Could not load tokens!", [])
    return
  }

  // update ETH price now that prices could have changed
  let bundle = Bundle.load('1')

  if (bundle === null) {
    log.error("Could not load bundle!", [])
    return
  }

  bundle.ethPriceUSD = getEthPriceInUSD()
  bundle.save()

  // update token prices
  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)
  token0.poolCount = token0.poolCount.plus(ONE_BI)
  token1.poolCount = token1.poolCount.plus(ONE_BI)
  token0.save()
  token1.save()
}

export function handleMint(event: MintEvent): void {
  let bundle = Bundle.load('1')
  let poolAddress = event.address.toHexString()
  let pool = Pool.load(poolAddress)
  let factory = Factory.load(FACTORY_ADDRESS)

  if (factory === null) {
    log.error("Could not load factory!", [])
    return
  }

  if (pool === null) {
    log.error("Could not load pool!", [])
    return
  }

  if (bundle === null) {
    log.error("Could not load bundle!", [])
    return
  }

  let token0 = Token.load(pool.token0)
  let token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null) {
    log.error("Could not load tokens!", [])
    return
  }

  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

  // update globals
  factory.txCount = factory.txCount.plus(ONE_BI)

  // update token0 data
  token0.txCount = token0.txCount.plus(ONE_BI)

  // update token1 data
  token1.txCount = token1.txCount.plus(ONE_BI)

  // pool data
  pool.txCount = pool.txCount.plus(ONE_BI)

  // Pools liquidity tracks the currently active liquidity given pools current tick.
  // We only want to update it on mint if the new position includes the current tick.
  if (
    pool.tick !== null &&
    BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
    BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
  ) {
    pool.liquidity = pool.liquidity.plus(event.params.amount)
  }

  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)

  token0.save()
  token1.save()
  pool.save()
  factory.save()
}

export function handleBurn(event: BurnEvent): void {
  let bundle = Bundle.load('1')
  let poolAddress = event.address.toHexString()
  let pool = Pool.load(poolAddress)
  let factory = Factory.load(FACTORY_ADDRESS)

  if (factory === null) {
    log.error("Could not load factory!", [])
    return
  }

  if (pool === null) {
    log.error("Could not load pool!", [])
    return
  }

  if (bundle === null) {
    log.error("Could not load bundle!", [])
    return
  }

  let token0 = Token.load(pool.token0)
  let token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null) {
    log.error("Could not load tokens!", [])
    return
  }
  
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

  // update globals
  factory.txCount = factory.txCount.plus(ONE_BI)

  // update token0 data
  token0.txCount = token0.txCount.plus(ONE_BI)

  // update token1 data
  token1.txCount = token1.txCount.plus(ONE_BI)

  // pool data
  pool.txCount = pool.txCount.plus(ONE_BI)

  // Pools liquidity tracks the currently active liquidity given pools current tick.
  // We only want to update it on burn if the position being burnt includes the current tick.
  if (
    pool.tick !== null &&
    BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
    BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
  ) {
    pool.liquidity = pool.liquidity.minus(event.params.amount)
  }

  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1)

  token0.save()
  token1.save()
  pool.save()
  factory.save()
}

export function handleSwap(event: SwapEvent): void {
  let bundle = Bundle.load('1')
  let factory = Factory.load(FACTORY_ADDRESS)
  let pool = Pool.load(event.address.toHexString())

  if (factory === null) {
    log.error("Could not load factory!", [])
    return   
  }

  if (pool === null) {
    log.error("Could not load pool!", [])
    return
  }

  if (bundle === null) {
    log.error("Could not load bundle!", [])
    return    
  }

  let token0 = Token.load(pool.token0)
  let token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null) {
    log.error("Could not load tokens!", [])
    return
  }

  // amounts - 0/1 are token deltas: can be positive or negative
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

  // global updates
  factory.txCount = factory.txCount.plus(ONE_BI)

  // pool volume
  pool.txCount = pool.txCount.plus(ONE_BI)

  // Update the pool with the new active liquidity, price, and tick.
  pool.liquidity = event.params.liquidity
  pool.tick = BigInt.fromI32(event.params.tick)
  pool.sqrtPrice = event.params.sqrtPriceX96
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)

  // update token0 data
  token0.txCount = token0.txCount.plus(ONE_BI)

  // update token1 data
  token1.txCount = token1.txCount.plus(ONE_BI)

  // updated pool rates
  let prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token)
  pool.token0Price = prices[0]
  pool.token1Price = prices[1]
  pool.save()

  // update USD pricing
  bundle.ethPriceUSD = getEthPriceInUSD()
  bundle.save()
  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)

  factory.save()
  pool.save()
  token0.save()
  token1.save()
}
