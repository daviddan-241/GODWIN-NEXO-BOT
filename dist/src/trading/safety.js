"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingSafetyError = void 0;
exports.assertNetworkAllowsTrading = assertNetworkAllowsTrading;
exports.assertTradeAmount = assertTradeAmount;
exports.clampSlippageBps = clampSlippageBps;
const constants_1 = require("../config/constants");
class TradingSafetyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TradingSafetyError';
    }
}
exports.TradingSafetyError = TradingSafetyError;
function assertNetworkAllowsTrading(config) {
    if (config.SOLANA_NETWORK === 'devnet')
        return; // devnet trading always allowed
    if (config.tradingAllowed)
        return;
    throw new TradingSafetyError('Mainnet trading is disabled. Set SOLANA_NETWORK=mainnet AND SOLANA_MAINNET_ENABLED=true to enable real transactions.');
}
function assertTradeAmount(lamports, config) {
    const amount = BigInt(lamports);
    if (amount < BigInt(constants_1.MIN_TRADE_LAMPORTS)) {
        throw new TradingSafetyError(`Trade amount too small (minimum ${constants_1.MIN_TRADE_LAMPORTS / 1_000_000} SOL).`);
    }
    if (amount > BigInt(Math.floor(config.maxTradeLamports))) {
        throw new TradingSafetyError(`Trade amount exceeds the per-trade cap of ${config.TRADING_MAX_SOL_PER_TRADE} SOL.`);
    }
}
function clampSlippageBps(bps) {
    if (!Number.isFinite(bps) || bps < constants_1.MIN_SLIPPAGE_BPS) {
        throw new TradingSafetyError(`Slippage too low (minimum ${constants_1.MIN_SLIPPAGE_BPS / 100}%).`);
    }
    if (bps > constants_1.MAX_SLIPPAGE_BPS) {
        throw new TradingSafetyError(`Slippage too high (maximum ${constants_1.MAX_SLIPPAGE_BPS / 100}%).`);
    }
    return Math.round(bps);
}
//# sourceMappingURL=safety.js.map