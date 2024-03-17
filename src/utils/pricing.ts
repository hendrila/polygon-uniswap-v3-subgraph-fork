/* eslint-disable prefer-const */
import { ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { Bundle, Pool, Token } from './../types/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { bigDecimalExponated, exponentToBigDecimal, safeDiv } from '../utils/index'

const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'
const WMATIC_ADDRESS = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const DAI_ADDRESS = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const WBTC_ADDRESS = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'
const LINK_ADDRESS = '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39'
const AAVE_ADDRESS = '0xD6DF932A45C0f255f85145f286eA0b292B21C90B'
const MKR_ADDRESS = '0x6f7C932e7684666C9fd1d44527765433e01fF61d'
const UNI_ADDRESS = '0xb33EaAd8d922B1083446DC23f610c2567fB5180f'
const CRV_ADDRESS = '0x172370d5Cd63279eFa6d502DAB29171933a610AF'
const GRT_ADDRESS = '0x5fe2B58c013d7601147DcdD68C143A77499f5531'
const LDO_ADDRESS = '0xC3C7d422809852031b44ab29EEC9F1EfF2A58756'

const USDC_WETH_03_POOL = '0x0e44ceb592acfc5d3f09d996302eb4c499ff8c10'

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with s
export let WHITELIST_TOKENS: string[] = [
  WETH_ADDRESS,
  WMATIC_ADDRESS,
  USDC_E_ADDRESS,
  USDC_ADDRESS,
  DAI_ADDRESS,
  USDT_ADDRESS,
  WBTC_ADDRESS,
  LINK_ADDRESS,
  AAVE_ADDRESS,
  MKR_ADDRESS,
  UNI_ADDRESS,
  CRV_ADDRESS,
  GRT_ADDRESS,
  LDO_ADDRESS
]

let STABLE_COINS: string[] = [
  USDC_ADDRESS,
  USDC_E_ADDRESS,
  DAI_ADDRESS,
  USDT_ADDRESS
]

let MINIMUM_ETH_LOCKED = BigDecimal.fromString('60')

const TWO_BD = BigDecimal.fromString('2')
const ONE_NINETY_TWO_BI = BigInt.fromI32(192)

const Q192 = bigDecimalExponated(TWO_BD, ONE_NINETY_TWO_BI)

export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, token0: Token, token1: Token): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  let price1a = safeDiv(num, Q192)
  let price1b = price1a.times(exponentToBigDecimal(token0.decimals))
  let price1 = safeDiv(price1b, exponentToBigDecimal(token1.decimals))
  let price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getEthPriceInUSD(): BigDecimal {
  let usdcPool = Pool.load(USDC_WETH_03_POOL) // USDC is token0
  if (usdcPool !== null) {
    return usdcPool.token0Price
  } else {
    return ZERO_BD
  }
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  let whiteList = token.whitelistPools
  
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  if (bundle === null) {
    log.error("Could not load the bundle!", [])
    return priceSoFar
  }

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD)
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      let poolAddress = whiteList[i]
      let pool = Pool.load(poolAddress)

      if (pool === null) {
        log.error("Could not load pool!", [])
        return priceSoFar
      }

      if (pool.liquidity.gt(ZERO_BI)) {
        if (pool.token0 == token.id) {
          // whitelist token is token1
          let token1 = Token.load(pool.token1)

          if (token1 === null) {
            log.error("Could not load the token!", [])
            return priceSoFar
          }

          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
            largestLiquidityETH = ethLocked
            // token1 per our token * Eth per token1
            priceSoFar = pool.token1Price.times(token1.derivedETH)
          }
        }
        if (pool.token1 == token.id) {
          let token0 = Token.load(pool.token0)

          if (token0 === null) {
            log.error("Could not load the token!", [])
            return priceSoFar
          }

          // get the derived ETH in pool
          let ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH)
          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
            largestLiquidityETH = ethLocked
            // token0 per our token * ETH per token0
            priceSoFar = pool.token0Price.times(token0.derivedETH)
          }
        }
      }
    }
  }

  return priceSoFar
}