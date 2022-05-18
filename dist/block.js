"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Block = exports.chaintip = exports.longestchainlength = void 0;
const message_1 = require("./message");
const hash_1 = require("./crypto/hash");
const json_canonicalize_1 = require("json-canonicalize");
const object_1 = require("./object");
const util_1 = __importDefault(require("util"));
const utxo_1 = require("./utxo");
const logger_1 = require("./logger");
const transaction_1 = require("./transaction");
const TARGET = "00000002af000000000000000000000000000000000000000000000000000000";
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
exports.longestchainlength = 0;
var height;
var currentchain = [];
var newcurrentchain = [];
var latestblockhash;
var coinbase_height_check = undefined;
class Block {
    constructor(previd, txids, nonce, T, created, miner, note) {
        this.previd = previd;
        this.txids = txids;
        this.nonce = nonce;
        this.T = T;
        this.created = created;
        this.miner = miner;
        this.note = note;
        this.blockid = (0, hash_1.hash)((0, json_canonicalize_1.canonicalize)(this.toNetworkObject()));
    }
    static fromNetworkObject(object) {
        return new Block(object.previd, object.txids, object.nonce, object.T, object.created, object.miner, object.note);
    }
    loadStateAfter() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return new utxo_1.UTXOSet(new Set(yield object_1.db.get(`blockutxo:${this.blockid}`)));
            }
            catch (e) {
                return null;
            }
        });
    }
    getCoinbase() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.txids.length === 0) {
                throw new Error("The block has no coinbase transaction");
            }
            const txid = this.txids[0];
            logger_1.logger.debug(`Checking whether ${txid} is the coinbase`);
            const obj = yield object_1.objectManager.get(txid);
            if (!message_1.TransactionObject.guard(obj)) {
                throw new Error("The block contains non-transaction txids");
            }
            const tx = transaction_1.Transaction.fromNetworkObject(obj);
            if (tx.isCoinbase()) {
                return tx;
            }
            throw new Error("The block has no coinbase transaction");
        });
    }
    toNetworkObject() {
        let netObj = {
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
    hasPoW() {
        return BigInt(`0x${this.blockid}`) <= BigInt(`0x${TARGET}`);
    }
    isGenesis() {
        return this.previd === null;
    }
    validateTx(peer, stateBefore) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.debug(`Validating ${this.txids.length} transactions of block ${this.blockid}`);
            const txPromises = [];
            let maybeTransactions = [];
            let txs = [];
            for (const txid of this.txids) {
                txPromises.push(object_1.objectManager.retrieve(txid, peer));
            }
            try {
                maybeTransactions = yield Promise.all(txPromises);
            }
            catch (e) {
                throw new Error(`Retrieval of transactions of block ${this.blockid} failed; rejecting block`);
            }
            logger_1.logger.debug(`We have all ${this.txids.length} transactions of block ${this.blockid}`);
            for (const maybeTx of maybeTransactions) {
                if (!message_1.TransactionObject.guard(maybeTx)) {
                    throw new Error(`Block reports a transaction with id ${object_1.objectManager.id(maybeTx)}, but this is not a transaction.`);
                }
                const tx = transaction_1.Transaction.fromNetworkObject(maybeTx);
                txs.push(tx);
            }
            const stateAfter = stateBefore.copy();
            yield stateAfter.applyMultiple(txs, this);
            logger_1.logger.debug(`UTXO state of block ${this.blockid} calculated`);
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
                coinbase = yield this.getCoinbase();
            }
            catch (e) { }
            if (coinbase !== undefined) {
                if (coinbase.outputs[0].value > BLOCK_REWARD + fees) {
                    throw new Error(`Coinbase transaction does not respect macroeconomic policy. ` +
                        `Coinbase output was ${coinbase.outputs[0].value}, while reward is ${BLOCK_REWARD} and fees were ${fees}.`);
                }
            }
            yield object_1.db.put(`blockutxo:${this.blockid}`, Array.from(stateAfter.outpoints));
            logger_1.logger.debug(`UTXO state of block ${this.blockid} cached: ${JSON.stringify(Array.from(stateAfter.outpoints))}`);
        });
    }
    validateAncestry(peer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.previd === null) {
                return null;
            }
            let parentBlock;
            try {
                logger_1.logger.debug(`Retrieving parent block of ${this.blockid} (${this.previd})`);
                const parentObject = yield object_1.objectManager.retrieve(this.previd, peer);
                if (!message_1.BlockObject.guard(parentObject)) {
                    throw new Error(`Got parent of block ${this.blockid}, but it was not of BlockObject type; rejecting block.`);
                }
                parentBlock = Block.fromNetworkObject(parentObject);
                if (parentBlock.created >= this.created) {
                    throw new Error("Block created before parent block");
                }
                yield parentBlock.validate(peer);
            }
            catch (e) {
                throw new Error(`Retrieval of block parent for block ${this.blockid} failed; rejecting block: ${e.message}`);
            }
            return parentBlock;
        });
    }
    validate(peer) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.debug(`Validating block ${this.blockid}`);
            if (this.T !== TARGET) {
                throw new Error(`Block ${this.blockid} does not specify the fixed target ${TARGET}, but uses target ${this.T} instead.`);
            }
            logger_1.logger.debug(`Block target for ${this.blockid} is valid`);
            if (!this.hasPoW()) {
                throw new Error(`Block ${this.blockid} does not satisfy the proof-of-work equation; rejecting block.`);
            }
            logger_1.logger.debug(`Block proof-of-work for ${this.blockid} is valid`);
            let parentBlock = null;
            let stateBefore = null;
            let time = new Date();
            if (this.created > time.getTime() / 1000) {
                throw new Error(" Block is mined in the future");
            }
            //Adding block to the front of array which has the current chain
            logger_1.logger.debug(`Block I am pushing ${this.blockid} right now!!`);
            if (!currentchain.includes(this)) {
                currentchain.unshift(this);
            }
            logger_1.logger.debug(`Current chain debugging ${currentchain.length} right now!!`);
            //logger.debug(`This is the height value ${height} of block ${this.blockid}`);
            if (this.isGenesis()) {
                if (!util_1.default.isDeepStrictEqual(this.toNetworkObject(), GENESIS)) {
                    currentchain = [];
                    throw new Error(`Invalid genesis block ${this.blockid}: ${JSON.stringify(this.toNetworkObject())}`);
                }
                logger_1.logger.debug(`Block ${this.blockid} is genesis block`);
                // genesis state
                stateBefore = new utxo_1.UTXOSet(new Set());
                logger_1.logger.debug(`State before block ${this.blockid} is the genesis state`);
                //check if coinbase transaction matches block height
                for (let i = 0; i < currentchain.length; i++) {
                    let temp_block = currentchain[i];
                    let blockheight = i;
                    try {
                        coinbase_height_check = yield temp_block.getCoinbase();
                    }
                    catch (e) {
                        coinbase_height_check = undefined;
                    }
                    logger_1.logger.debug(`This is the coinbase txn ${coinbase_height_check}`);
                    if (coinbase_height_check !== undefined) {
                        if (blockheight !== coinbase_height_check.height) {
                            currentchain = [];
                            logger_1.logger.debug(`This is the blockheight ${blockheight} for block ${temp_block.blockid}`);
                            logger_1.logger.debug(`This is the coinbase height ${coinbase_height_check.height} for block ${temp_block.blockid}`);
                            throw new Error("Block height and coinbase height do not match");
                        }
                    }
                }
                // store chain tip of current chain
                if (currentchain.length > exports.longestchainlength) {
                    exports.chaintip = currentchain.slice(-1)[0].blockid;
                    exports.longestchainlength = currentchain.length;
                }
                logger_1.logger.debug(`This is the chain tip babla ${exports.chaintip}`);
                logger_1.logger.debug(`This is the longest chain length ${exports.longestchainlength}`);
                // clear current chain
                currentchain = [];
                logger_1.logger.debug(`Reset chain length should be ${currentchain.length}`);
            }
            else {
                parentBlock = yield this.validateAncestry(peer);
                if (parentBlock === null) {
                    throw new Error(`Parent block of block ${this.blockid} was null`);
                }
                // this block's starting state is the previous block's ending state
                stateBefore = yield parentBlock.loadStateAfter();
                logger_1.logger.debug(`Loaded state before block ${this.blockid}`);
            }
            logger_1.logger.debug(`Block ${this.blockid} has valid ancestry`);
            if (stateBefore === null) {
                throw new Error(`We have not calculated the state of the parent block,` +
                    `so we cannot calculate the state of the current block with blockid = ${this.blockid}`);
            }
            logger_1.logger.debug(`State before block ${this.blockid} is ${stateBefore}`);
            yield this.validateTx(peer, stateBefore);
            logger_1.logger.debug(`Block ${this.blockid} has valid transactions`);
        });
    }
}
exports.Block = Block;
