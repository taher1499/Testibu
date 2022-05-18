"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./logger");
const network_1 = require("./network");
const BIND_PORT = 18018;
const BIND_IP = "104.207.149.243";
logger_1.logger.info(`Malibu - A Marabu node`);
logger_1.logger.info(`Dionysis Zindros <dionyziz@stanford.edu>`);
network_1.network.init(BIND_PORT, BIND_IP);
