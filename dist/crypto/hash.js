"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hash = void 0;
const fast_sha256_1 = __importDefault(require("fast-sha256"));
function hash(str) {
    const encoder = new TextEncoder();
    const hash = (0, fast_sha256_1.default)(encoder.encode(str));
    const hashHex = Buffer.from(hash).toString('hex');
    return hashHex;
}
exports.hash = hash;
