"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraMsgType = exports.ClientMsgType = void 0;
// Incoming messages from the camera's perspective
var ClientMsgType;
(function (ClientMsgType) {
    ClientMsgType[ClientMsgType["unknown"] = 0] = "unknown";
    ClientMsgType[ClientMsgType["ack"] = 1] = "ack";
    ClientMsgType[ClientMsgType["auth0"] = 2] = "auth0";
    ClientMsgType[ClientMsgType["auth1"] = 3] = "auth1";
    ClientMsgType[ClientMsgType["settings"] = 4] = "settings";
    ClientMsgType[ClientMsgType["pwd"] = 5] = "pwd";
})(ClientMsgType = exports.ClientMsgType || (exports.ClientMsgType = {}));
// Outgoing message from the camera's perspective
var CameraMsgType;
(function (CameraMsgType) {
    CameraMsgType[CameraMsgType["unknown"] = 255] = "unknown";
    CameraMsgType[CameraMsgType["auth0"] = 254] = "auth0";
    CameraMsgType[CameraMsgType["auth1"] = 253] = "auth1";
    CameraMsgType[CameraMsgType["frame"] = 252] = "frame";
})(CameraMsgType = exports.CameraMsgType || (exports.CameraMsgType = {}));
/**
 * Message Sequence
 *
 * client                  camera
 * | on open                    |
 * | ----------auth0----------> |
 * |              on connection |
 * | <---------auth0----------- |
 *
 * | on auth0                   |
 * | ----------auth1----------> |
 * |                   on auth1 |
 * | <---------auth1----------- |
 *
 * |                   on auth1 |
 * | <----frame (encrypted)---- |
 * | on frame                   |
 * | ----------ack------------> |
 *
 * Header: <Message type [UInt8] | MessageId [UInt32LE]>
 *
 * AESEncrypted: <Initialization Vector [16 Bytes] | Authentication Tag [16 Bytes] | aes-128-gcm Encrypted Data...>
 * Password: String encoded in UTF-8 Buffer
 * Settings: JSON String encoded in UTF-8 Buffer
 *
 * auth0 (client out): <Header | ECDF Public Key Buffer>
 * auth0 (camera out): <Header | ECDF Public Key Buffer>
 *
 * auth1 (client out): <Header | AESEncrypted(Password)>
 * auth1 (camera out): <Header | AESEncrypted(Settings)>
 */ 
//# sourceMappingURL=enums.js.map