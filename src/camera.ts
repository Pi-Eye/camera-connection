import fs from "fs";
import WebSocket from "ws";
import crypto from "crypto";
import { IncomingMessage } from "http";
import { AllSettings } from "camera-interface";
import argon2 from "argon2";
import EventEmitter from "events";
import TypedEventEmitter from "typed-emitter";

import { ClientMsgType, CameraMsgType } from "./enums";
import { ClientMsg, CameraMsg, CameraSideEvents } from "./types";
import * as utils from "./utils";
import { AddressInfo } from "net";

/**
 * Congestion control behavior intended to implement ideas found in V. Jacobson's 1988 Paper "Congestion Avoidance and Control"
 * V. Jacobson. 1988. Congestion avoidance and control. SIGCOMM Comput. Commun. Rev. 18, 4 (August 1988), 314–329. https://doi.org/10.1145/52325.52356
 */

const CURVE_NAME = process.env.CURVE_NAME || "secp521r1";                 // ECDH algorithm to use
const MAX_QUEUE_LENGTH = parseInt(process.env.MAX_QUEUE_LENGTH) || 30;    // Nmmber of items in queue before dropping frames
const RTT_GAIN = parseFloat(process.env.RTT_GAIN) || 0.125;               // "gain", 0 < gain < 1 for estimating average RTT, see paper
const DEV_GAIN = parseFloat(process.env.DEV_GAIN) || 0.25;                // "gain", 0 < gain < 1 for estimating mean deviation, see paper

export default class CameraSide {
  private events_ = new EventEmitter() as TypedEventEmitter<CameraSideEvents>;
  get events() { return this.events_; }

  private ack_timeout_: NodeJS.Timeout;

  private server_: WebSocket.Server;
  private socket_: WebSocket.WebSocket;

  private all_settings_: AllSettings;

  private ecdh_: crypto.ECDH;
  private hash_: string;
  private secret_: Buffer;
  private authenticated_ = false;

  private last_id_ = 0;
  private inflight_: Array<{ id: number, timestamp: number }> = [];

  private send_queue_: Array<Buffer> = [];

  private rtt_avg_: number;
  private mean_dev_: number;
  private rto_interval_: number;
  private last_send_window_count_: number;
  private rto_timeout_: NodeJS.Timeout;

  private hash_file_loc_: string;
  private port_: number;

  constructor(port: number, hash_file_loc: string, settings: AllSettings) {
    this.port_ = port;
    this.all_settings_ = settings;
    this.ReadHashFile(hash_file_loc);
    this.CreateServer();
  }

  /**
   * QueueFrame() - Queues up a frame to be sent
   * @param frame frame to queue
   */
  QueueFrame(frame: Buffer, timestamp: number, motion: boolean) {
    if (!this.authenticated_) return;

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
    } catch (error) {
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
    clearTimeout(this.ack_timeout_);
    clearTimeout(this.rto_timeout_);
    this.authenticated_ = false;
    this.send_queue_ = [];
    this.server_.clients.forEach((socket) => {
      socket.close();
    });
    this.server_.close();
  }

  /**
   * CreateServer() - Creates websocket server
   */
  private CreateServer() {
    this.authenticated_ = false;
    this.server_ = new WebSocket.Server({ port: this.port_ });

    this.server_.on("connection", (socket, request) => {
      this.SocketHandler(socket, request);
    });

    this.server_.on("listening", () => {
      const address = (this.server_.address() as AddressInfo).address + ":" + (this.server_.address() as AddressInfo).port;
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
  private AckHandler(ack: ClientMsg) {
    clearInterval(this.ack_timeout_);
    this.ack_timeout_ = setTimeout(() => {
      console.warn("Did not recieve acknowledgements for 10 seconds, terminating connection");
      try { this.socket_.terminate(); } catch { /* */ }
    }, 10000);

    if (this.inflight_[0].id == ack.id) {
      const sent = this.inflight_.shift();
      const rtt = Date.now() - sent.timestamp;

      // Calculate next rto_interval
      const err = rtt - this.rtt_avg_;
      this.rtt_avg_ = this.rtt_avg_ + RTT_GAIN * err;
      this.mean_dev_ = this.mean_dev_ + DEV_GAIN * (Math.abs(err) - this.mean_dev_);

      this.rto_interval_ = this.rtt_avg_ + this.mean_dev_;

      if (this.inflight_.length == 0) { this.SendWindow(this.last_send_window_count_ + 1); }
    }
  }

  /**
   * Auth0Handler() - Handles responding to auth0 message
   * @param auth0 auth0 message
   * @param socket websocket
   * @param address address of websocket
   */
  private async Auth0Handler(auth0: ClientMsg, socket: WebSocket, address: string) {
    try {
      this.secret_ = this.ecdh_.computeSecret(auth0.msg).subarray(0, 16);
    }
    catch (error) {
      console.warn(`Failed to compute secret key, terminating connection with $${address}. Error: ${error}`);
    }
  }

  /**
   * Auth1Handler() - Handles responding to auth1 message
   * @param auth1 auth1 message
   * @param socket websocket
   * @param address address of websocket
   */
  private async Auth1Handler(auth1: ClientMsg, socket: WebSocket, address: string) {
    const trip_time = Date.now() - auth1.timestamp;
    // Parse out password
    let pwd;
    try {
      pwd = utils.AesDecrypt(auth1.msg, this.secret_).toString("utf-8");
    } catch (error) {
      console.warn(`Failed to decrypt password, terminating connection with $${address}. Error: ${error}`);
      socket.close();
      return;
    }

    // Verify hash
    try {
      if (!(await argon2.verify(this.hash_, pwd))) {
        console.warn(`Incorrect password recieved, terminating connection with $${address}`);
        socket.close();
        return;
      }
    } catch (error) {
      console.warn(`Failed to hash password, terminating connection with $${address}`);
      socket.close();
      return;
    }

    // Encrypt settings and send
    let encrypted;
    try {
      encrypted = utils.AesEncrypt(Buffer.from(JSON.stringify(this.all_settings_), "utf-8"), this.secret_);
    } catch (error) {
      console.warn(`Failed to encrypt message, terminating connection with $${address}. Error: ${error}`);
      socket.close();
    }
    socket.send(this.GenMsg(CameraMsgType.auth1, encrypted).msg);

    // Getting here means successful authentication
    console.log(`Authenticated successfully with ${address}`);
    this.authenticated_ = true;
    this.socket_ = socket;

    this.rtt_avg_ = trip_time * 2;
    this.rto_interval_ = this.rtt_avg_;
    this.mean_dev_ = 0;
    this.send_queue_ = [];
    this.SendWindow();
    this.events_.emit("ready");
  }

  /**
   * SettingsHandler() - Handles settings message
   * @param settings settings message
   * @param socket websocket
   * @param address address of websocket
   */
  private SettingsHandler(settings: ClientMsg, socket: WebSocket, address: string) {
    let new_settings;
    try {
      console.log("Setting new settings");
      new_settings = JSON.parse(utils.AesDecrypt(settings.msg, this.secret_).toString("utf-8"));
    } catch (error) {
      console.warn(`Failed to parse new settings, terminating connection with ${address}. Error: ${error}`);
      socket.close();
      return;
    }
    this.events_.emit("settings", new_settings);
  }

  private async PwdHandler(pwd: ClientMsg, socket: WebSocket, address: string) {
    try {
      console.log("Setting new password");
      const password = utils.AesDecrypt(pwd.msg, this.secret_).toString("utf-8");
      const hash = await argon2.hash(password);
      fs.writeFileSync(this.hash_file_loc_, JSON.stringify({ hash: hash }));
    } catch (error) {
      console.warn(`Error while setting new password, terminating connection with ${address}. Error: ${error}`);
      socket.close();
      return;
    }

    this.ReadHashFile(this.hash_file_loc_);
    this.Stop();
    setTimeout(() => this.CreateServer(), 3000);
  }

  /**
   * SocketHandler() - Handles authenticating connection, then recieving messages on connection
   * @param socket socket to authenticate
   * @param request information about the request header
   */
  private SocketHandler(socket: WebSocket.WebSocket, request: IncomingMessage) {
    const address = (request.socket.address() as AddressInfo).address + ":" + (request.socket.address() as AddressInfo).port;
    console.log(`Opened socket with: ${address}`);

    if (this.authenticated_) {    // Ignore if already authenticated
      console.log(`Already authenticated with different client, terminating connection with ${address}`);
      socket.close();
      return;
    }

    // Begin ECDH key exchange once connected
    this.ecdh_ = crypto.createECDH(CURVE_NAME);
    const keys = this.ecdh_.generateKeys();
    socket.send(this.GenMsg(CameraMsgType.auth0, keys).msg);

    socket.on("message", (data, isBinary) => {
      if (!isBinary) { // Close connection if invalid data recieved
        console.warn(`Recieved non binary data, terminating connection with ${address}`);
        socket.close();
        return;
      }

      this.MessageHandler(data as Buffer, socket, address);
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
  private MessageHandler(msg: Buffer, socket: WebSocket, address: string) {
    let client_msg;
    try {
      client_msg = utils.ParseClientMsgType(msg);
    } catch (error) {
      console.warn(`Error while parsing message, terminating connection with ${address}. Error: ${error}`);
      this.socket_.terminate();
      return;
    }

    switch (client_msg.type) {
      case (ClientMsgType.ack): {
        this.AckHandler(client_msg);
        break;
      }
      case (ClientMsgType.auth0): {
        this.Auth0Handler(client_msg, socket, address);
        break;
      }
      case (ClientMsgType.auth1): {
        this.Auth1Handler(client_msg, socket, address);
        break;
      }
      case (ClientMsgType.settings): {
        this.SettingsHandler(client_msg, socket, address);
        break;
      }
      case (ClientMsgType.pwd): {
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
  private HalveQueue() {
    const new_queue: Array<Buffer> = [];

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
  private SendWindow(number?: number) {
    if (!this.socket_) return;
    if (!number || number < 1) number = 1;
    this.last_send_window_count_ = number;
    clearInterval(this.rto_timeout_);

    for (let i = 0; i < number && this.send_queue_.length > 0; i++) {
      try {
        const message = this.GenMsg(CameraMsgType.frame, this.send_queue_.shift());
        this.Send(this.socket_, message);
      } catch (error) {
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
  private GenMsg(type: CameraMsgType, content: Buffer): CameraMsg {
    this.last_id_ = (this.last_id_ + 1) / (1 << 32);      // Roll over to 0 if id is over UInt32 size
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
  private Send(socket: WebSocket, message: CameraMsg) {
    this.inflight_.push({ id: message.id, timestamp: message.timestamp });
    try {
      socket.send(message.msg);
    } catch { /* */ }
  }

  /**
   * ReadHashFile() - Reads JSON config file and sets this.hash_
   * @param hash_file_loc location of file
   */
  private ReadHashFile(hash_file_loc: string) {
    this.hash_file_loc_ = hash_file_loc;
    const hash_file = fs.readFileSync(hash_file_loc);
    const data = JSON.parse(hash_file.toString());
    this.hash_ = data.hash;
  }
}