"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const ws_1 = __importDefault(require("ws"));
const crypto_1 = __importDefault(require("crypto"));
const argon2_1 = __importDefault(require("argon2"));
const events_1 = __importDefault(require("events"));
const enums_1 = require("./enums");
const utils = __importStar(require("./utils"));
/**
 * Congestion control behavior intended to implement ideas found in V. Jacobson's 1988 Paper "Congestion Avoidance and Control"
 * V. Jacobson. 1988. Congestion avoidance and control. SIGCOMM Comput. Commun. Rev. 18, 4 (August 1988), 314–329. https://doi.org/10.1145/52325.52356
 */
const CURVE_NAME = process.env.CURVE_NAME || "secp521r1"; // ECDH algorithm to use
const MAX_QUEUE_LENGTH = parseInt(process.env.MAX_QUEUE_LENGTH) || 30; // Nmmber of items in queue before dropping frames
const RTT_GAIN = parseFloat(process.env.RTT_GAIN) || 0.125; // "gain", 0 < gain < 1 for estimating average RTT, see paper
const DEV_GAIN = parseFloat(process.env.DEV_GAIN) || 0.25; // "gain", 0 < gain < 1 for estimating mean deviation, see paper
class CameraSide {
    constructor(port, hash_file_loc, settings) {
        this.events_ = new events_1.default();
        this.authenticated_ = false;
        this.last_id_ = 0;
        this.inflight_ = [];
        this.send_queue_ = [];
        this.port_ = port;
        this.all_settings_ = settings;
        this.ReadHashFile(hash_file_loc);
        this.CreateServer();
    }
    get events() { return this.events_; }
    /**
     * QueueFrame() - Queues up a frame to be sent
     * @param frame frame to queue
     */
    QueueFrame(frame, timestamp, motion) {
        if (!this.authenticated_)
            return;
        const motion_int = (motion) ? 1 : 0;
        const header = Buffer.alloc(1 + 8);
        header.writeUint8(motion_int, 0);
        header.writeBigInt64BE(BigInt(timestamp), 1);
        if (this.send_queue_.length == MAX_QUEUE_LENGTH) {
            console.warn("Queue full, dropping frames");
            this.HalveQueue();
        }
        let encrypted;
        try {
            encrypted = utils.AesEncrypt(Buffer.concat([header, frame]), this.secret_);
        }
        catch (error) {
            console.warn(`Error while encrypting frame, terminating connection. Error: ${error}`);
            this.socket_.terminate();
            return;
        }
        this.send_queue_.push(encrypted);
    }
    /**
     * Stop() - Fully stops websocket server
     */
    Stop() {
        try {
            clearTimeout(this.ack_timeout_);
            clearTimeout(this.rto_timeout_);
            this.authenticated_ = false;
            this.send_queue_ = [];
            this.server_.clients.forEach((socket) => {
                socket.close();
            });
            this.server_.close();
        }
        catch (error) {
            console.log(error);
        }
    }
    /**
     * CreateServer() - Creates websocket server
     */
    CreateServer() {
        this.authenticated_ = false;
        this.server_ = new ws_1.default.Server({ port: this.port_ });
        this.server_.on("connection", (socket, request) => {
            this.SocketHandler(socket, request);
        });
        this.server_.on("listening", () => {
            const address = this.server_.address().address + ":" + this.server_.address().port;
            console.log(`Server listening on ${address}`);
        });
        // Just close socket if an error occurs
        this.server_.on("error", (error) => {
            this.server_.close();
            throw error;
        });
        // Restart the socket if it closes (unless restart_ set to false)
        this.server_.on("close", () => {
            console.log("Server that was listening closed");
            this.server_.removeAllListeners();
        });
    }
    /**
     * AckHandler() - Handles acknowledgement of recieved data
     * @param ack acknowledgement message
     */
    AckHandler(ack) {
        clearInterval(this.ack_timeout_);
        this.ack_timeout_ = setTimeout(() => {
            console.warn("Did not recieve acknowledgements for 10 seconds, terminating connection");
            try {
                this.socket_.terminate();
            }
            catch ( /* */_a) { /* */ }
        }, 10000);
        if (this.inflight_[0].id == ack.id) {
            const sent = this.inflight_.shift();
            const rtt = Date.now() - sent.timestamp;
            // Calculate next rto_interval
            const err = rtt - this.rtt_avg_;
            this.rtt_avg_ = this.rtt_avg_ + RTT_GAIN * err;
            this.mean_dev_ = this.mean_dev_ + DEV_GAIN * (Math.abs(err) - this.mean_dev_);
            this.rto_interval_ = this.rtt_avg_ + this.mean_dev_;
            if (this.inflight_.length == 0) {
                this.SendWindow(this.last_send_window_count_ + 1);
            }
        }
    }
    /**
     * Auth0Handler() - Handles responding to auth0 message
     * @param auth0 auth0 message
     * @param socket websocket
     * @param address address of websocket
     */
    Auth0Handler(auth0, socket, address) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.secret_ = this.ecdh_.computeSecret(auth0.msg).subarray(0, 16);
            }
            catch (error) {
                console.warn(`Failed to compute secret key, terminating connection with $${address}. Error: ${error}`);
            }
        });
    }
    /**
     * Auth1Handler() - Handles responding to auth1 message
     * @param auth1 auth1 message
     * @param socket websocket
     * @param address address of websocket
     */
    Auth1Handler(auth1, socket, address) {
        return __awaiter(this, void 0, void 0, function* () {
            // Parse out password
            let pwd;
            try {
                pwd = utils.AesDecrypt(auth1.msg, this.secret_).toString("utf-8");
            }
            catch (error) {
                console.warn(`Failed to decrypt password, terminating connection with $${address}. Error: ${error}`);
                socket.close();
                return;
            }
            // Verify hash
            try {
                if (!(yield argon2_1.default.verify(this.hash_, pwd))) {
                    console.warn(`Incorrect password recieved, terminating connection with $${address}`);
                    socket.close();
                    return;
                }
            }
            catch (error) {
                console.warn(`Failed to hash password, terminating connection with $${address}`);
                socket.close();
                return;
            }
            // Encrypt settings and send
            let encrypted;
            try {
                encrypted = utils.AesEncrypt(Buffer.from(JSON.stringify(this.all_settings_), "utf-8"), this.secret_);
            }
            catch (error) {
                console.warn(`Failed to encrypt message, terminating connection with $${address}. Error: ${error}`);
                socket.close();
            }
            socket.send(this.GenMsg(enums_1.CameraMsgType.auth1, encrypted).msg);
            // Getting here means successful authentication
            console.log(`Authenticated successfully with ${address}`);
            this.authenticated_ = true;
            this.socket_ = socket;
            this.rtt_avg_ = 0;
            this.rto_interval_ = 0;
            this.mean_dev_ = 0;
            this.send_queue_ = [];
            this.SendWindow();
            this.events_.emit("ready");
        });
    }
    /**
     * SettingsHandler() - Handles settings message
     * @param settings settings message
     * @param socket websocket
     * @param address address of websocket
     */
    SettingsHandler(settings, socket, address) {
        let new_settings;
        try {
            console.log("Setting new settings");
            new_settings = JSON.parse(utils.AesDecrypt(settings.msg, this.secret_).toString("utf-8"));
        }
        catch (error) {
            console.warn(`Failed to parse new settings, terminating connection with ${address}. Error: ${error}`);
            socket.close();
            return;
        }
        this.events_.emit("settings", new_settings);
    }
    PwdHandler(pwd, socket, address) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log("Setting new password");
                const password = utils.AesDecrypt(pwd.msg, this.secret_).toString("utf-8");
                const hash = yield argon2_1.default.hash(password);
                fs_1.default.writeFileSync(this.hash_file_loc_, JSON.stringify({ hash: hash }));
            }
            catch (error) {
                console.warn(`Error while setting new password, terminating connection with ${address}. Error: ${error}`);
                socket.close();
                return;
            }
            this.ReadHashFile(this.hash_file_loc_);
            this.Stop();
            setTimeout(() => this.CreateServer(), 3000);
        });
    }
    /**
     * SocketHandler() - Handles authenticating connection, then recieving messages on connection
     * @param socket socket to authenticate
     * @param request information about the request header
     */
    SocketHandler(socket, request) {
        const address = request.socket.address().address + ":" + request.socket.address().port;
        console.log(`Opened socket with: ${address}`);
        if (this.authenticated_) { // Ignore if already authenticated
            console.log(`Already authenticated with different client, terminating connection with ${address}`);
            socket.close();
            return;
        }
        // Begin ECDH key exchange once connected
        this.ecdh_ = crypto_1.default.createECDH(CURVE_NAME);
        const keys = this.ecdh_.generateKeys();
        socket.send(this.GenMsg(enums_1.CameraMsgType.auth0, keys).msg);
        socket.on("message", (data, isBinary) => {
            if (!isBinary) { // Close connection if invalid data recieved
                console.warn(`Recieved non binary data, terminating connection with ${address}`);
                socket.close();
                return;
            }
            this.MessageHandler(data, socket, address);
        });
        socket.on("close", (code) => {
            this.socket_ = undefined;
            this.authenticated_ = false;
            console.log(`Connection closed with ${address} with code: ${code}`);
            socket.removeAllListeners();
        });
        socket.on("error", (error) => {
            console.warn(`Error on connection with ${address}. Error: ${error}`);
            socket.close();
        });
    }
    /**
     * MessageHandler() - Handles socket messages
     * @param msg message buffer
     * @param socket websocket
     * @param address address of websocket
     */
    MessageHandler(msg, socket, address) {
        let client_msg;
        try {
            client_msg = utils.ParseClientMsgType(msg);
        }
        catch (error) {
            console.warn(`Error while parsing message, terminating connection with ${address}. Error: ${error}`);
            this.socket_.terminate();
            return;
        }
        switch (client_msg.type) {
            case (enums_1.ClientMsgType.ack): {
                this.AckHandler(client_msg);
                break;
            }
            case (enums_1.ClientMsgType.auth0): {
                this.Auth0Handler(client_msg, socket, address);
                break;
            }
            case (enums_1.ClientMsgType.auth1): {
                this.Auth1Handler(client_msg, socket, address);
                break;
            }
            case (enums_1.ClientMsgType.settings): {
                this.SettingsHandler(client_msg, socket, address);
                break;
            }
            case (enums_1.ClientMsgType.pwd): {
                this.PwdHandler(client_msg, socket, address);
                break;
            }
            default: {
                console.warn(`Recieved type: ${client_msg.type} message before authentication, terminating connection with ${address}`);
                socket.terminate();
            }
        }
        return;
    }
    /**
     * HalveQueue() - Removes half of the frames in send queue
     */
    HalveQueue() {
        const new_queue = [];
        for (let i = 0; i < this.send_queue_.length; i++) {
            if (i % 2 == 0) {
                new_queue.push(this.send_queue_.splice(i, 1)[0]);
            }
            else {
                this.send_queue_.splice(i, 1);
            }
        }
        this.send_queue_ = new_queue;
    }
    /**
     * SendWindow() - Send this.send of frames from queue
     * @param number number of frames to send
     */
    SendWindow(number) {
        if (!this.socket_)
            return;
        if (!number || number < 1)
            number = 1;
        this.last_send_window_count_ = number;
        clearInterval(this.rto_timeout_);
        for (let i = 0; i < number && this.send_queue_.length > 0; i++) {
            try {
                const message = this.GenMsg(enums_1.CameraMsgType.frame, this.send_queue_.shift());
                this.Send(this.socket_, message);
            }
            catch (error) {
                console.warn(`Error while encrypting frame to send, terminating connection. Error: ${error}`);
                this.socket_.terminate();
            }
        }
        this.rto_timeout_ = setTimeout(() => {
            this.SendWindow(Math.round(this.last_send_window_count_ / 2));
        }, this.rto_interval_);
    }
    /**
     * GenMsg() - Generates messages to send
     * Format: <Message type [UInt8] | MessageId [UInt32BE] | Timestamp [UInt64BE] | Content...>
     * @param type type of message to send
     * @param content content of message
     * @returns object { msg: Buffer, id: number };
     */
    GenMsg(type, content) {
        this.last_id_ = (this.last_id_ + 1) / (1 << 32); // Roll over to 0 if id is over UInt32 size
        const timestamp = Date.now();
        const header = Buffer.alloc(1 + 4 + 8);
        header.writeUint8(type, 0);
        header.writeUint32BE(this.last_id_, 1);
        header.writeBigUInt64BE(BigInt(timestamp), 5);
        return {
            id: this.last_id_,
            timestamp,
            type: type,
            msg: Buffer.concat([header, content])
        };
    }
    /**
     * Send() - Send a message
     * @param message message to send
     */
    Send(socket, message) {
        this.inflight_.push({ id: message.id, timestamp: message.timestamp });
        try {
            socket.send(message.msg);
        }
        catch ( /* */_a) { /* */ }
    }
    /**
     * ReadHashFile() - Reads JSON config file and sets this.hash_
     * @param hash_file_loc location of file
     */
    ReadHashFile(hash_file_loc) {
        this.hash_file_loc_ = hash_file_loc;
        const hash_file = fs_1.default.readFileSync(hash_file_loc);
        const data = JSON.parse(hash_file.toString());
        this.hash_ = data.hash;
    }
}
exports.default = CameraSide;
//# sourceMappingURL=camera.js.map