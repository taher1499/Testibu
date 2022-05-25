import {
  BlockObject,
  BlockObjectType,
  OutpointObjectType,
  TransactionObject,
  ObjectType,
} from "./message";
import { hash } from "./crypto/hash";
import { canonicalize } from "json-canonicalize";
import { Peer } from "./peer";
import { objectManager, ObjectId, db } from "./object";
import util from "util";
import { UTXOSet, UTXO } from "./utxo";
import { logger } from "./logger";
import { Transaction } from "./transaction";
import { chainManager } from "./chain";
import { mempool } from "./mempool";

const TARGET =
  "00000002af000000000000000000000000000000000000000000000000000000";
const GENESIS: BlockObjectType = {
  T: "00000002af000000000000000000000000000000000000000000000000000000",
  created: 1624219079,
  miner: "dionyziz",
  nonce: "0000000000000000000000000000000000000000000000000000002634878840",
  note: "The Economist 2021-06-20: Crypto-miners are probably to blame for the graphics-chip shortage",
  previd: null,
  txids: [],
  type: "block",
};
const BU = 10 ** 12;
const BLOCK_REWARD = 50 * BU;

export class Block {
  previd: string | null;
  txids: ObjectId[];
  nonce: string;
  T: string;
  created: number;
  miner: string | undefined;
  note: string | undefined;
  blockid: string;
  fees: number | undefined;

  public static makeGenesis(): Block {
    return Block.fromNetworkObject(GENESIS);
  }
  public static fromNetworkObject(object: BlockObjectType) {
    return new Block(
      object.previd,
      object.txids,
      object.nonce,
      object.T,
      object.created,
      object.miner,
      object.note
    );
  }
  constructor(
    previd: string | null,
    txids: string[],
    nonce: string,
    T: string,
    created: number,
    miner: string | undefined,
    note: string | undefined
  ) {
    this.previd = previd;
    this.txids = txids;
    this.nonce = nonce;
    this.T = T;
    this.created = created;
    this.miner = miner;
    this.note = note;
    this.blockid = hash(canonicalize(this.toNetworkObject()));
  }
  async loadStateAfter(): Promise<UTXOSet | null> {
    try {
      return new UTXOSet(
        new Set<string>(await db.get(`blockutxo:${this.blockid}`))
      );
    } catch (e) {
      return null;
    }
  }
  async loadHeight(): Promise<number | null> {
    if (this.isGenesis()) {
      return 0;
    }
    try {
      return await db.get(`blockheight:${this.blockid}`);
    } catch (e) {
      return null;
    }
  }
  async getCoinbase(): Promise<Transaction> {
    if (this.txids.length === 0) {
      throw new Error("The block has no coinbase transaction");
    }
    const txid = this.txids[0];
    logger.debug(`Checking whether ${txid} is the coinbase`);
    const obj = await objectManager.get(txid);

    if (!TransactionObject.guard(obj)) {
      throw new Error("The block contains non-transaction txids");
    }

    const tx: Transaction = Transaction.fromNetworkObject(obj);

    if (tx.isCoinbase()) {
      return tx;
    }
    throw new Error("The block has no coinbase transaction");
  }
  toNetworkObject() {
    let netObj: BlockObjectType = {
      type: "block",
      previd: this.previd,
      txids: this.txids,
      nonce: this.nonce,
      T: this.T,
      created: this.created,
      miner: this.miner,
    };

    if (this.note !== undefined) {
      netObj.note = this.note;
    }
    return netObj;
  }
  hasPoW(): boolean {
    return BigInt(`0x${this.blockid}`) <= BigInt(`0x${TARGET}`);
  }
  isGenesis(): boolean {
    return this.previd === null;
  }
  async validateTx(peer: Peer, stateBefore: UTXOSet, height: number) {
    logger.debug(
      `Validating ${this.txids.length} transactions of block ${this.blockid}`
    );

    const txPromises: Promise<ObjectType>[] = [];
    let maybeTransactions: ObjectType[] = [];
    let txs: Transaction[] = [];

    for (const txid of this.txids) {
      txPromises.push(objectManager.retrieve(txid, peer));
    }
    try {
      maybeTransactions = await Promise.all(txPromises);
    } catch (e) {
      throw new Error(
        `Retrieval of transactions of block ${this.blockid} failed; rejecting block`
      );
    }
    logger.debug(
      `We have all ${this.txids.length} transactions of block ${this.blockid}`
    );
    for (const maybeTx of maybeTransactions) {
      if (!TransactionObject.guard(maybeTx)) {
        throw new Error(
          `Block reports a transaction with id ${objectManager.id(
            maybeTx
          )}, but this is not a transaction.`
        );
      }
      const tx = Transaction.fromNetworkObject(maybeTx);
      txs.push(tx);
    }
    const stateAfter = stateBefore.copy();

    await stateAfter.applyMultiple(txs, this);
    logger.debug(`UTXO state of block ${this.blockid} calculated`);

    let fees = 0;
    for (const tx of txs) {
      if (tx.fees === undefined) {
        throw new Error(`Transaction fees not calculated`);
      }
      fees += tx.fees;
      await mempool.removefromMempool(tx);
    }
    this.fees = fees;

    let coinbase;

    try {
      coinbase = await this.getCoinbase();
    } catch (e) {}

    if (coinbase !== undefined) {
      if (coinbase.outputs[0].value > BLOCK_REWARD + fees) {
        throw new Error(
          `Coinbase transaction does not respect macroeconomic policy. ` +
            `Coinbase output was ${coinbase.outputs[0].value}, while reward is ${BLOCK_REWARD} and fees were ${fees}.`
        );
      }
      if (coinbase.height !== height) {
        throw new Error(
          `Coinbase transaction ${coinbase.txid} of block ${this.blockid} indicates height ${coinbase.height}, ` +
            `while the block has height ${height}.`
        );
      }
    }

    await db.put(`blockutxo:${this.blockid}`, Array.from(stateAfter.outpoints));
    logger.debug(
      `UTXO state of block ${this.blockid} cached: ${JSON.stringify(
        Array.from(stateAfter.outpoints)
      )}`
    );
  }
  async validateAncestry(peer: Peer): Promise<Block | null> {
    if (this.previd === null) {
      // genesis
      return null;
    }

    let parentBlock: Block;
    try {
      logger.debug(
        `Retrieving parent block of ${this.blockid} (${this.previd})`
      );
      const parentObject = await objectManager.retrieve(this.previd, peer);

      if (!BlockObject.guard(parentObject)) {
        throw new Error(
          `Got parent of block ${this.blockid}, but it was not of BlockObject type; rejecting block.`
        );
      }
      parentBlock = Block.fromNetworkObject(parentObject);
      await parentBlock.validate(peer);
    } catch (e: any) {
      throw new Error(
        `Retrieval of block parent for block ${this.blockid} failed; rejecting block: ${e.message}`
      );
    }
    return parentBlock;
  }
  async validate(peer: Peer) {
    logger.debug(`Validating block ${this.blockid}`);
    if (this.T !== TARGET) {
      throw new Error(
        `Block ${this.blockid} does not specify the fixed target ${TARGET}, but uses target ${this.T} instead.`
      );
    }
    logger.debug(`Block target for ${this.blockid} is valid`);
    if (!this.hasPoW()) {
      throw new Error(
        `Block ${this.blockid} does not satisfy the proof-of-work equation; rejecting block.`
      );
    }
    logger.debug(`Block proof-of-work for ${this.blockid} is valid`);

    let parentBlock: Block | null = null;
    let stateBefore: UTXOSet | null = null;
    let height: number;

    if (this.isGenesis()) {
      height = 0;
      if (!util.isDeepStrictEqual(this.toNetworkObject(), GENESIS)) {
        throw new Error(
          `Invalid genesis block ${this.blockid}: ${JSON.stringify(
            this.toNetworkObject()
          )}`
        );
      }
      logger.debug(`Block ${this.blockid} is genesis block`);
      // genesis state
      stateBefore = new UTXOSet(new Set<string>());
      logger.debug(`State before block ${this.blockid} is the genesis state`);
    } else {
      parentBlock = await this.validateAncestry(peer);

      if (parentBlock === null) {
        throw new Error(`Parent block of block ${this.blockid} was null`);
      }

      const parentHeight = await parentBlock.loadHeight();

      if (parentHeight === null) {
        throw new Error(
          `Parent block ${parentBlock.blockid} of block ${this.blockid} has no known height`
        );
      }

      height = parentHeight + 1;
      await db.put(`blockheight:${this.blockid}`, height);

      if (parentBlock.created >= this.created) {
        throw new Error(
          `Parent block ${parentBlock.blockid} created at ${parentBlock.created} has future timestamp of ` +
            `block ${this.blockid} created at ${this.created}.`
        );
      }
      const currentUNIXtimestamp = Math.floor(new Date().getTime() / 1000);
      if (this.created > currentUNIXtimestamp) {
        throw new Error(
          `Block ${this.blockid} has a timestamp ${this.created} in the future. ` +
            `Current time is ${currentUNIXtimestamp}.`
        );
      }

      // this block's starting state is the previous block's ending state
      stateBefore = await parentBlock.loadStateAfter();
      logger.debug(`Loaded state before block ${this.blockid}`);
    }
    logger.debug(`Block ${this.blockid} has valid ancestry`);

    if (stateBefore === null) {
      throw new Error(
        `We have not calculated the state of the parent block,` +
          `so we cannot calculate the state of the current block with blockid = ${this.blockid}`
      );
    }

    logger.debug(`State before block ${this.blockid} is ${stateBefore}`);

    await this.validateTx(peer, stateBefore, height);
    logger.debug(`Block ${this.blockid} has valid transactions`);

    await chainManager.onValidBlockArrival(this);
  }
}
