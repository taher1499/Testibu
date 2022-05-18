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

const TARGET =
  "00000002af000000000000000000000000000000000000000000000000000000";
const GENESIS = {
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

export var longestchainlength = 0;

export var chaintip: string | null;

var height: number | undefined;

var currentchain: Block[] = [];

var newcurrentchain: Block[] = [];

var latestblockhash: string;

var coinbase_height_check: Transaction | undefined = undefined;

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

  static fromNetworkObject(object: BlockObjectType) {
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
  async validateTx(peer: Peer, stateBefore: UTXOSet) {
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

      if (parentBlock.created >= this.created) {
        throw new Error("Block created before parent block");
      }

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

    let time = new Date();

    if (this.created > time.getTime() / 1000) {
      throw new Error(" Block is mined in the future");
    }

    //Adding block to the front of array which has the current chain
    logger.debug(`Block I am pushing ${this.blockid} right now!!`);
    if (!currentchain.includes(this)) {
      currentchain.unshift(this);
    }
    logger.debug(`Current chain debugging ${currentchain.length} right now!!`);

    //logger.debug(`This is the height value ${height} of block ${this.blockid}`);

    if (this.isGenesis()) {
      if (!util.isDeepStrictEqual(this.toNetworkObject(), GENESIS)) {
        currentchain = [];
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

      //check if coinbase transaction matches block height
      for (let i: number = 0; i < currentchain.length; i++) {
        let temp_block = currentchain[i];
        let blockheight = i;

        try {
          coinbase_height_check = await temp_block.getCoinbase();
        } catch (e) {
          coinbase_height_check = undefined;
        }

        logger.debug(`This is the coinbase txn ${coinbase_height_check}`);
        if (coinbase_height_check !== undefined) {
          if (blockheight !== coinbase_height_check.height) {
            currentchain = [];
            logger.debug(
              `This is the blockheight ${blockheight} for block ${temp_block.blockid}`
            );
            logger.debug(
              `This is the coinbase height ${coinbase_height_check.height} for block ${temp_block.blockid}`
            );
            throw new Error("Block height and coinbase height do not match");
          }
        }
      }

      // store chain tip of current chain

      if (currentchain.length > longestchainlength) {
        chaintip = currentchain.slice(-1)[0].blockid;
        longestchainlength = currentchain.length;
      }
      logger.debug(`This is the chain tip babla ${chaintip}`);
      logger.debug(`This is the longest chain length ${longestchainlength}`);

      // clear current chain
      currentchain = [];
      logger.debug(`Reset chain length should be ${currentchain.length}`);
    } else {
      parentBlock = await this.validateAncestry(peer);

      if (parentBlock === null) {
        throw new Error(`Parent block of block ${this.blockid} was null`);
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

    await this.validateTx(peer, stateBefore);
    logger.debug(`Block ${this.blockid} has valid transactions`);
  }
}
