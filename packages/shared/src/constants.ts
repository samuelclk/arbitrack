import { Chain } from "./types.js";

export const ENV_VARS = ["DATABASE_URL", "ALCHEMY_KEY", "PENDLE_API_BASE"] as const;

export const DEFAULT_PENDLE_API_BASE = "https://api-v2.pendle.finance/core";

export const CHAIN_IDS = {
  [Chain.Mainnet]: 1,
  [Chain.Arbitrum]: 42161,
  [Chain.Optimism]: 10,
  [Chain.Base]: 8453,
} as const satisfies Record<Chain, number>;

export const ALCHEMY_RPC_URLS = {
  [Chain.Mainnet]: "https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
  [Chain.Arbitrum]: "https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
  [Chain.Optimism]: "https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
  [Chain.Base]: "https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}",
} as const satisfies Record<Chain, string>;

export const alchemyRpcUrl = (chain: Chain, alchemyKey: string) =>
  ALCHEMY_RPC_URLS[chain].replace("${ALCHEMY_KEY}", alchemyKey);

export const MAINNET_CONTRACT_ADDRESSES = {
  lidoSteth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  lidoWsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  lidoWithdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  curveStethEthPool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
  curveStethNgPool: "0x21E27a5E5513D6e65C4f830167390997aA84843a",
  uniswapV3Quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  uniswapV3WstethWeth001Pool: "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa",
  uniswapV3WstethWeth005Pool: "0xd340b57aacdd10f96fc1cf10e15921936f41e29c",
  balancerWstethWethMetaStable: "0x32296969ef14eb0c6d29669c550d4a0449130230",
  aaveV3Pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  sparkPool: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987",
  compoundV3CWeth: "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
  chainlinkEthUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  morphoBlueGraphql: "https://blue-api.morpho.org/graphql",
} as const;

export const AAVE_V3_POOL_ADDRESSES = {
  [Chain.Mainnet]: MAINNET_CONTRACT_ADDRESSES.aaveV3Pool,
  [Chain.Arbitrum]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [Chain.Optimism]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [Chain.Base]: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
} as const satisfies Record<Chain, string>;

export const COMPOUND_V3_CWETH_ADDRESSES = {
  [Chain.Mainnet]: MAINNET_CONTRACT_ADDRESSES.compoundV3CWeth,
  [Chain.Arbitrum]: "0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486",
  [Chain.Optimism]: "0xE36A30D249f7761327fd973001A32010b521b6Fd",
  [Chain.Base]: "0x46e6b214b524310239732D51387075E0e70970bf",
} as const satisfies Record<Chain, string>;

export const ASSET_ADDRESSES = {
  WETH: {
    [Chain.Mainnet]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    [Chain.Arbitrum]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    [Chain.Optimism]: "0x4200000000000000000000000000000000000006",
    [Chain.Base]: "0x4200000000000000000000000000000000000006",
  },
  wstETH: {
    [Chain.Mainnet]: MAINNET_CONTRACT_ADDRESSES.lidoWsteth,
    [Chain.Arbitrum]: "0x5979D7b546E38E414F7E9822514be443A4800529",
    [Chain.Optimism]: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
    [Chain.Base]: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  },
} as const satisfies Record<"WETH" | "wstETH", Record<Chain, string>>;

export const FUNDING_BASIS_SYMBOL_WHITELIST = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "MATIC",
  "DOT",
  "LTC",
  "BCH",
  "NEAR",
  "ATOM",
  "ARB",
  "OP",
  "SUI",
  "APT",
  "TON",
] as const;

export const STABLECOIN_ASSET_WHITELIST = [
  "USDC",
  "USDT",
  "DAI",
  "GHO",
  "USDS",
  "crvUSD",
  "sUSDe",
] as const;
