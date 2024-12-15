/* eslint-disable no-case-declarations */
import path from 'path'
import { toWei } from 'web3-utils'
import fetch from 'node-fetch'

import { FullNode } from '@zkopru/core'
import { logger, sleep } from '@zkopru/utils'
import { ZkWallet } from '@zkopru/zk-wizard'
import { getBase, startLogger } from './generator-utils'
import { config } from './config'

const organizerUrl = process.env.ORGANIZER_URL ?? 'http://organizer:8080'

// TODO: When transfered UTXO discovery features added, This will refactor as ETH supplier for testing wallets
startLogger(`./BLOCKTURNNER_LOG`)

// Block Turner is for Zkopru layer 2 chain being continue by deposit tx with enough fee
async function runBlockTurner() {
  // This function will start after all wallet node are deposited for testing
  // It is more explicit thatn checking deposit interval
  let ready = false
  logger.info(`stress-test/blockturner.ts - standby for all wallets are registered to organizer`)
  while (!ready) {
    try {
      // organizer has wallet node info
      const registerResponse = await fetch(`${organizerUrl}/registered-node-info`, {
        method: 'get',
      })
      
      const walletData = await registerResponse.json()
      const walletStatus = walletData.map(wallet => {
        return wallet.from !== ''
      })

      // If all wallet node done deposit process, then will get the walletStatus has only `true`
      if (!walletStatus.includes(false)) {
        ready = true
      }
    } catch (error) {
      logger.error(`stress-test/blockturner.ts - error checking organizer ready : ${error}`)
    }
    await sleep(14000)
  }
  await sleep(35000)

  logger.info('stress-test/blockturner.ts - layer2 block turner initializing')
  const { hdWallet, mockupDB, webSocketProvider } = await getBase(
    config.testnetUrl,
    config.mnemonic,
    'helloworld',
  )

  const walletNode: FullNode = await FullNode.new({
    provider: webSocketProvider,
    address: config.zkopruContract, // Zkopru contract
    db: mockupDB,
    accounts: [],
  })

  // Assume that account index 0, 1, 2 are reserved
  // Account #0 - Coordinator
  // Account #1 - Slasher
  // Account #2 - Turner
  const walletAccount = await hdWallet.createAccount(2)
  const turnerConfig = {
    wallet: hdWallet,
    account: walletAccount,
    accounts: [walletAccount],
    node: walletNode,
    erc20: [],
    erc721: [],
    snarkKeyPath: path.join(__dirname, '../../circuits/keys'),
  }

  const turner = new ZkWallet(turnerConfig)
  turner.node.start()
  turner.setAccount(walletAccount)

  // recursively check 15 block periods
  let depositTimer
  function depositLater() {
    depositTimer = setTimeout(async () => {
      logger.info(`stress-test/blockturner.ts - no proposal detected in about 15 blocks, sending deposit tx`)
      const result = await turner.depositEther(
        toWei('1', 'wei'),
        toWei('0.1'),
      )
      if (!result) {
        throw new Error('Deposit Transaction Failed!')
      }
    }, 14000 * 15) // about 15 blocks period time
  }

  depositLater()

  let lastProposalAt = 0
  walletNode.layer1.coordinator.events
    .NewProposal({ fromBlock: lastProposalAt })
    .on('connected', subId => {
      logger.info(`stress-test/blockturner.ts - additional proposal event watch Id : ${subId}`)
    })
    .on('data', async event => {
      const { returnValues, blockNumber } = event
      const { proposalNum, blockHash } = returnValues
      logger.trace(`stress-test/blockturner.ts - runBlockTurner : proposalnum(${proposalNum}) - blockHash(${blockHash})@blockNumber(${blockNumber})`)
      lastProposalAt = blockNumber

      // Reset timer for deposit
      clearTimeout(depositTimer)
      depositLater()
    })
}

runBlockTurner()
