import { Block } from "./block";
import { logger } from "./logger";
import { mempool } from "./mempool";

class ChainManager {
  longestChainHeight: number = 0;
  longestChainTip: Block | null = null;

  init() {
    this.longestChainTip = Block.makeGenesis();
  }
  async onValidBlockArrival(block: Block) {
    const height = await block.loadHeight();

    if (height === null) {
      return;
    }
    if (height > this.longestChainHeight) {
      logger.debug(
        `New longest chain has height ${height} and tip ${block.blockid}`
      );
      this.longestChainHeight = height;
      this.longestChainTip = block;
      mempool.currentchaintip = block;
    }
  }
}

export const chainManager = new ChainManager();
