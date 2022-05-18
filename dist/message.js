"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = exports.Messages = exports.ErrorMessage = exports.ChainTipMessage = exports.GetChainTipMessage = exports.ObjectMessage = exports.Object = exports.IHaveObjectMessage = exports.GetObjectMessage = exports.PeersMessage = exports.GetPeersMessage = exports.HelloMessage = exports.BlockObject = exports.HumanReadable = exports.TransactionObject = exports.SpendingTransactionObject = exports.CoinbaseTransactionObject = exports.TransactionOutputObject = exports.TransactionInputObject = exports.OutpointObject = void 0;
const runtypes_1 = require("runtypes");
const Hash = runtypes_1.String.withConstraint((s) => /^[0-9a-f]{64}$/.test(s));
const Sig = runtypes_1.String.withConstraint((s) => /^[0-9a-f]{128}$/.test(s));
const PK = runtypes_1.String.withConstraint((s) => /^[0-9a-f]{64}$/.test(s));
const NonNegative = runtypes_1.Number.withConstraint((n) => n >= 0);
const Coins = NonNegative;
exports.OutpointObject = (0, runtypes_1.Record)({
    txid: Hash,
    index: NonNegative,
});
exports.TransactionInputObject = (0, runtypes_1.Record)({
    outpoint: exports.OutpointObject,
    sig: (0, runtypes_1.Union)(Sig, runtypes_1.Null),
});
exports.TransactionOutputObject = (0, runtypes_1.Record)({
    pubkey: PK,
    value: Coins,
});
exports.CoinbaseTransactionObject = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("transaction"),
    outputs: (0, runtypes_1.Array)(exports.TransactionOutputObject).withConstraint((a) => a.length <= 1),
    height: NonNegative,
});
exports.SpendingTransactionObject = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("transaction"),
    inputs: (0, runtypes_1.Array)(exports.TransactionInputObject),
    outputs: (0, runtypes_1.Array)(exports.TransactionOutputObject),
});
exports.TransactionObject = (0, runtypes_1.Union)(exports.CoinbaseTransactionObject, exports.SpendingTransactionObject);
exports.HumanReadable = runtypes_1.String.withConstraint((s) => s.length <= 128 && s.match(/^[ -~]+$/) !== null // ASCII-printable
);
exports.BlockObject = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("block"),
    txids: (0, runtypes_1.Array)(Hash),
    nonce: runtypes_1.String,
    previd: (0, runtypes_1.Union)(Hash, runtypes_1.Null),
    created: runtypes_1.Number,
    T: Hash,
    miner: (0, runtypes_1.Optional)(exports.HumanReadable),
    note: (0, runtypes_1.Optional)(exports.HumanReadable),
});
exports.HelloMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("hello"),
    version: runtypes_1.String,
    agent: runtypes_1.String,
});
exports.GetPeersMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("getpeers"),
});
exports.PeersMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("peers"),
    peers: (0, runtypes_1.Array)(runtypes_1.String),
});
exports.GetObjectMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("getobject"),
    objectid: Hash,
});
exports.IHaveObjectMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("ihaveobject"),
    objectid: Hash,
});
exports.Object = (0, runtypes_1.Union)(exports.TransactionObject, exports.BlockObject);
exports.ObjectMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("object"),
    object: exports.Object,
});
exports.GetChainTipMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("getchaintip"),
});
exports.ChainTipMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("chaintip"),
    blockid: Hash,
});
exports.ErrorMessage = (0, runtypes_1.Record)({
    type: (0, runtypes_1.Literal)("error"),
    error: runtypes_1.String,
});
exports.Messages = [
    exports.HelloMessage,
    exports.GetPeersMessage,
    exports.PeersMessage,
    exports.IHaveObjectMessage,
    exports.GetObjectMessage,
    exports.ObjectMessage,
    exports.ErrorMessage,
    exports.GetChainTipMessage,
    exports.ChainTipMessage,
];
exports.Message = (0, runtypes_1.Union)(exports.HelloMessage, exports.GetPeersMessage, exports.PeersMessage, exports.IHaveObjectMessage, exports.GetObjectMessage, exports.ObjectMessage, exports.ErrorMessage, exports.ChainTipMessage, exports.GetChainTipMessage);
