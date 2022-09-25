"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AesDecrypt = exports.AesEncrypt = exports.ParseCameraMsgType = exports.ParseClientMsgType = exports.KEY_LENGTH = void 0;
const crypto_1 = __importDefault(require("crypto"));
const enums_1 = require("./enums");
const KEY_ALGORITHM = "aes-128-gcm";
exports.KEY_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ID_OFFSET = 1;
const TIMESTAMP_OFFSET = 5;
const MSG_OFFSET = 13;
/**
 * ParseClientMsgType() - Parses the type of incoming client message
 * @param msg message to parse type from
 * @returns type of message
 */
function ParseClientMsgType(msg) {
    const id = msg.readUInt32BE(ID_OFFSET);
    switch (msg.readUint8(0)) {
        case (enums_1.ClientMsgType.ack): {
            return {
                id,
                timestamp: 0,
                type: enums_1.ClientMsgType.ack,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.ClientMsgType.auth0): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.ClientMsgType.auth0,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.ClientMsgType.auth1): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.ClientMsgType.auth1,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.ClientMsgType.settings): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.ClientMsgType.settings,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.ClientMsgType.pwd): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.ClientMsgType.pwd,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        default: {
            return {
                id,
                timestamp: 0,
                type: enums_1.ClientMsgType.unknown,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
    }
}
exports.ParseClientMsgType = ParseClientMsgType;
/**
 * ParseCameraMsgType() - Parses the type of incoming camera message
 * @param msg message to parse type from
 * @returns type of message
 */
function ParseCameraMsgType(msg) {
    const id = msg.readUInt32BE(ID_OFFSET);
    switch (msg.readUint8(0)) {
        case (enums_1.CameraMsgType.auth0): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.CameraMsgType.auth0,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.CameraMsgType.auth1): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.CameraMsgType.auth1,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        case (enums_1.CameraMsgType.frame): {
            return {
                id,
                timestamp: Number(msg.readBigInt64BE(TIMESTAMP_OFFSET)),
                type: enums_1.CameraMsgType.frame,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
        default: {
            return {
                id,
                timestamp: 0,
                type: enums_1.CameraMsgType.unknown,
                msg: msg.subarray(MSG_OFFSET)
            };
        }
    }
}
exports.ParseCameraMsgType = ParseCameraMsgType;
/**
 * AesEncrypt() - Decrypts aes encrypted data
 * @param data buffer of data to encrypt
 * @param key buffer of key to decrypt data
 * @returns encrypted buffer in format: <Initialization Vector [16 Bytes] | Authentication Tag [16 Bytes] | aes-128-gcm Encrypted Data...>
 */
function AesEncrypt(data, key) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(KEY_ALGORITHM, key, iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
}
exports.AesEncrypt = AesEncrypt;
/**
 * AesDecrypt() - Decrypts aes encrypted data
 * @param encrypted encrypted buffer in format: <Initialization Vector [16 Bytes] | Authentication Tag [16 Bytes] | aes-128-gcm Encrypted Data...>
 * @param key buffer of key to decrypt data
 * @returns buffer of unencrypted data
 */
function AesDecrypt(encrypted, key) {
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const data = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH, encrypted.length);
    const decipher = crypto_1.default.createDecipheriv(KEY_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(data);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
}
exports.AesDecrypt = AesDecrypt;
//# sourceMappingURL=utils.js.map