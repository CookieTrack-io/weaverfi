
// Imports:
import axios from 'axios';
import { minABI, beefy } from '../../ABIs';
import { query, multicallOneMethodQuery, addToken, addLPToken, addCurveToken, parseBN } from '../../functions';
import type { Chain, Address, URL, Token, LPToken, BeefyAPIResponse } from '../../types';

// Initializations:
const chain: Chain = 'avax';
const project = 'beefy';
const staking: Address = '0x86d38c6b6313c5A3021D68D1F57CF5e69197592A';
const bifi: Address = '0xd6070ae98b8069de6B494332d1A1a81B6179D960';
const wavax: Address = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const apiURL: URL = 'https://api.beefy.finance';

/* ========================================================================================================================================================================= */

// Function to get project balance:
export const get = async (wallet: Address) => {
  let balance: (Token | LPToken)[] = [];
  try {
    let vaultsData: BeefyAPIResponse[] = (await axios.get(apiURL + '/vaults')).data;
    let apyData: Record<string, number | null> = (await axios.get(apiURL + '/apy')).data;
    let vaults = vaultsData.filter(vault => vault.chain === 'avax' && vault.status === 'active');
    balance.push(...(await getVaultBalances(wallet, vaults, apyData)));
    balance.push(...(await getStakedBIFI(wallet)));
  } catch {
    console.error(`Error fetching ${project} balances on ${chain.toUpperCase()}.`);
  }
  return balance;
}

/* ========================================================================================================================================================================= */

// Function to get vault balances:
export const getVaultBalances = async (wallet: Address, vaults: BeefyAPIResponse[], apys: Record<string, number | null>) => {
  let balances: (Token | LPToken)[] = [];

  // Balance Multicall Query:
  let vaultAddresses = vaults.map(vault => vault.earnedTokenAddress);
  let multicallResults = await multicallOneMethodQuery(chain, vaultAddresses, minABI, 'balanceOf', [wallet]);
  let promises = vaults.map(vault => (async () => {
    let balanceResults = multicallResults[vault.earnedTokenAddress];
    if(balanceResults) {
      let balance = parseBN(balanceResults[0]);
      if(balance > 0) {
        let decimals = parseInt(await query(chain, vault.earnedTokenAddress, minABI, 'decimals', []));
        let exchangeRate = parseInt(await query(chain, vault.earnedTokenAddress, beefy.vaultABI, 'getPricePerFullShare', []));
        let underlyingBalance = balance * (exchangeRate / (10 ** decimals));
  
        // Native Token Vaults:
        if(!vault.tokenAddress) {
          if(vault.token === 'AVAX') {
            let newToken = await addToken(chain, project, 'staked', wavax, underlyingBalance, wallet);
            let vaultAPY = apys[vault.id];
            if(vaultAPY) {
              newToken.info = {
                apy: vaultAPY
              }
            }
            balances.push(newToken);
          }
        } else {
  
          // Curve Vaults:
          if(vault.platform === 'Curve') {
            let newToken = await addCurveToken(chain, project, 'staked', vault.tokenAddress, underlyingBalance, wallet);
            let vaultAPY = apys[vault.id];
            if(vaultAPY) {
              newToken.info = {
                apy: vaultAPY
              }
            }
            balances.push(newToken);
    
          // LP Token Vaults:
          } else if(vault.assets.length === 2) {
            let newToken = await addLPToken(chain, project, 'staked', vault.tokenAddress, underlyingBalance, wallet);
            let vaultAPY = apys[vault.id];
            if(vaultAPY) {
              newToken.info = {
                apy: vaultAPY
              }
            }
            balances.push(newToken);
    
          // Single-Asset Vaults:
          } else if(vault.assets.length === 1) {
            let newToken = await addToken(chain, project, 'staked', vault.tokenAddress, underlyingBalance, wallet);
            let vaultAPY = apys[vault.id];
            if(vaultAPY) {
              newToken.info = {
                apy: vaultAPY
              }
            }
            balances.push(newToken);
          }
        }
      }
    }
  })());
  await Promise.all(promises);
  return balances;
}

// Function to get staked BIFI balance:
export const getStakedBIFI = async (wallet: Address) => {
  let balances: Token[] = [];
  let balance = parseInt(await query(chain, staking, minABI, 'balanceOf', [wallet]));
  if(balance > 0) {
    let newToken = await addToken(chain, project, 'staked', bifi, balance, wallet);
    balances.push(newToken);
  }
  let pendingRewards = parseInt(await query(chain, staking, beefy.stakingABI, 'earned', [wallet]));
  if(pendingRewards > 0) {
    let newToken = await addToken(chain, project, 'unclaimed', wavax, pendingRewards, wallet);
    balances.push(newToken);
  }
  return balances;
}