import { Block } from './block'
import { logger } from './logger'
import { OutpointObject, OutpointObjectType } from './message'
import { db, ObjectId } from './object'
import { Outpoint, Transaction } from './transaction'

export type UTXO = Set<string>

export class UTXOSet {
  outpoints: UTXO = new Set<string>()

  constructor(outpoints: UTXO) {
    this.outpoints = outpoints
  }
  copy() {
    return new UTXOSet(new Set<string>(Array.from(this.outpoints)))
  }
  async apply(tx: Transaction, idx?: number, block?: Block) {
    logger.debug(`Applying transaction ${tx.txid} to UTXO set`)
    await tx.validate(idx, block)
    logger.debug(`Transaction ${tx.txid} has fees ${tx.fees}`)

    const seen: Set<string> = new Set<string>()

    for (const input of tx.inputs) {
      const outpointStr: string = input.outpoint.toString()

      if (!this.outpoints.has(outpointStr)) {
        throw new Error(`Transaction consumes output (${JSON.stringify(outpointStr)}) that is not in the UTXO set. ` +
                        `This is either a double spend, or a spend of a transaction we have not seen before.`)
      }
      if (seen.has(outpointStr)) {
        throw new Error('Two different inputs of the same transaction are spending the same outpoint')
      }
      seen.add(outpointStr)
    }
    for (const input of tx.inputs) {
      this.outpoints.delete(input.outpoint.toString())
    }
    logger.debug(`Adding ${tx.outputs.length} outputs to UTXO set`)
    for (let i = 0; i < tx.outputs.length; ++i) {
      this.outpoints.add((new Outpoint(tx.txid, i)).toString())
    }
    logger.debug(`Outpoints set after tx application: ${this}`)
  }
  async applyMultiple(txs: Transaction[], block?: Block) {
    let idx = 0

    for (const tx of txs) {
      logger.debug(`Applying transaction ${tx.txid} to state`)
      await this.apply(tx, idx, block)
      logger.debug(`State after transaction application is: ${this}`)
      ++idx
    }
  }
  toString() {
    return `UTXO set: ${JSON.stringify(Array.from(this.outpoints))}`
  }
}
