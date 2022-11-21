/// <reference types="node" />
import { AllSettings } from "camera-interface";
import TypedEventEmitter from "typed-emitter";
import { CameraSideEvents } from "./types";
export default class CameraSide {
    private events_;
    get events(): TypedEventEmitter<CameraSideEvents>;
    private ack_timeout_;
    private server_;
    private socket_;
    private address_;
    private all_settings_;
    private ecdh_;
    private hash_;
    private secret_;
    private last_id_;
    private inflight_;
    private send_queue_;
    private rtt_avg_;
    private mean_dev_;
    private rto_interval_;
    private last_send_window_count_;
    private rto_timeout_;
    private hash_file_loc_;
    private port_;
    constructor(port: number, hash_file_loc: string, settings: AllSettings);
    /**
     * QueueFrame() - Queues up a frame to be sent
     * @param frame frame to queue
     */
    QueueFrame(frame: Buffer, timestamp: number, motion: boolean): void;
    /**
     * Stop() - Fully stops websocket server
     */
    Stop(): void;
    /**
     * CreateServer() - Creates websocket server
     */
    private CreateServer;
    /**
     * AckHandler() - Handles acknowledgement of recieved data
     * @param ack acknowledgement message
     */
    private AckHandler;
    /**
     * Auth0Handler() - Handles responding to auth0 message
     * @param auth0 auth0 message
     * @param socket websocket
     * @param address address of websocket
     */
    private Auth0Handler;
    /**
     * Auth1Handler() - Handles responding to auth1 message
     * @param auth1 auth1 message
     * @param socket websocket
     * @param address address of websocket
     */
    private Auth1Handler;
    /**
     * SettingsHandler() - Handles settings message
     * @param settings settings message
     * @param socket websocket
     * @param address address of websocket
     */
    private SettingsHandler;
    private PwdHandler;
    /**
     * SocketHandler() - Handles authenticating connection, then recieving messages on connection
     * @param socket socket to authenticate
     * @param request information about the request header
     */
    private SocketHandler;
    /**
     * MessageHandler() - Handles socket messages
     * @param msg message buffer
     * @param socket websocket
     * @param address address of websocket
     */
    private MessageHandler;
    /**
     * HalveQueue() - Removes half of the frames in send queue
     */
    private HalveQueue;
    /**
     * SendWindow() - Send this.send of frames from queue
     * @param number number of frames to send
     */
    private SendWindow;
    /**
     * GenMsg() - Generates messages to send
     * Format: <Message type [UInt8] | MessageId [UInt32BE] | Timestamp [UInt64BE] | Content...>
     * @param type type of message to send
     * @param content content of message
     * @returns object { msg: Buffer, id: number };
     */
    private GenMsg;
    /**
     * Send() - Send a message
     * @param message message to send
     */
    private Send;
    /**
     * ReadHashFile() - Reads JSON config file and sets this.hash_
     * @param hash_file_loc location of file
     */
    private ReadHashFile;
}
