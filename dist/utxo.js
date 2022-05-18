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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UTXOSet = void 0;
const logger_1 = require("./logger");
const transaction_1 = require("./transaction");
class UTXOSet {
    constructor(outpoints) {
        this.outpoints = new Set();
        this.outpoints = outpoints;
    }
    copy() {
        return new UTXOSet(new Set(Array.from(this.outpoints)));
    }
    apply(tx, idx, block) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.debug(`Applying transaction ${tx.txid} to UTXO set`);
            yield tx.validate(idx, block);
            logger_1.logger.debug(`Transaction ${tx.txid} has fees ${tx.fees}`);
            const seen = new Set();
            for (const input of tx.inputs) {
                const outpointStr = input.outpoint.toString();
                if (!this.outpoints.has(outpointStr)) {
                    throw new Error(`Transaction consumes output (${JSON.stringify(outpointStr)}) that is not in the UTXO set. ` +
                        `This is either a double spend, or a spend of a transaction we have not seen before.`);
                }
                if (seen.has(outpointStr)) {
                    throw new Error('Two different inputs of the same transaction are spending the same outpoint');
                }
                seen.add(outpointStr);
            }
            for (const input of tx.inputs) {
                this.outpoints.delete(input.outpoint.toString());
            }
            logger_1.logger.debug(`Adding ${tx.outputs.length} outputs to UTXO set`);
            for (let i = 0; i < tx.outputs.length; ++i) {
                this.outpoints.add((new transaction_1.Outpoint(tx.txid, i)).toString());
            }
            logger_1.logger.debug(`Outpoints set after tx application: ${this}`);
        });
    }
    applyMultiple(txs, block) {
        return __awaiter(this, void 0, void 0, function* () {
            let idx = 0;
            for (const tx of txs) {
                logger_1.logger.debug(`Applying transaction ${tx.txid} to state`);
                yield this.apply(tx, idx, block);
                logger_1.logger.debug(`State after transaction application is: ${this}`);
                ++idx;
            }
        });
    }
    toString() {
        return `UTXO set: ${JSON.stringify(Array.from(this.outpoints))}`;
    }
}
exports.UTXOSet = UTXOSet;
