import { chainManager } from "./chain";
import { Transaction } from "./transaction";
import { Block } from "./block";

class Mempool {
  txids: string[] = [];
  currentchaintip: Block | null = Block.makeGenesis();

  init() {
    this.currentchaintip = Block.makeGenesis();
  }

  async addtoMempool(txn: Transaction) {
    if (this.currentchaintip !== null) {
      // let currentUTXO = await this.currentchaintip.loadStateAfter();
      // if (currentUTXO !== null) {
      //   await currentUTXO.apply(txn);
      //   if (this.txids.includes(txn.txid)) {
      //     this.txids.push(txn.txid);
      //   }
      // }
      if (!this.txids.includes(txn.txid)) {
        this.txids.push(txn.txid);
      }
    }
  }

  async removefromMempool(txn: Transaction) {
    const index = this.txids.indexOf(txn.txid);
    if (index > -1) {
      this.txids.splice(index);
    }
  }
}

export const mempool = new Mempool();
