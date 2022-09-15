// Incoming messages from the camera's perspective
export enum ClientMsgType { unknown = 0, ack = 1, auth0 = 2, auth1 = 3, settings = 4, pwd = 5 }
// Outgoing message from the camera's perspective
export enum CameraMsgType { unknown = 255, auth0 = 254, auth1 = 253, frame = 252 }


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