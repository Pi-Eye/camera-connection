import TypedEmitter from "typed-emitter";
import CameraInterface, { AllSettings, CameraEvents } from "camera-interface";
export default class CameraClient implements CameraInterface {
    private events_;
    get events(): TypedEmitter<CameraEvents>;
    private restart_;
    private frame_timeout_;
    private socket_;
    private address_;
    private ecdh_;
    private pwd_;
    private secret_;
    private last_id_;
    private all_settings_;
    private config_file_loc_;
    constructor(config_file_loc: string);
    SetCombinedSettings(settings: AllSettings): void;
    GetCombinedSettings(): AllSettings;
    /**
     * SetPassword() - Sets a new password
     * @param pwd new password
     */
    SetPassword(pwd: string): void;
    /**
     * Stop() - Fully stops websocket
     */
    Stop(): void;
    /**
     * Connect() - Connects to address, reconnects on failure after a delay
     */
    private Connect;
    /**
     * Auth0Handler() - Handles responding to auth0 message
     * @param auth0 auth0 message
     */
    private Auth0Handler;
    /**
     * Auth1Handler() - Handles responding to auth1 message
     * @param auth1 auth1 message
     */
    private Auth1Handler;
    /**
     * FrameHandler() - Handles responding to frame message
     * @param frame_msg frame message
     */
    private FrameHandler;
    /**
     * MessageHandler() - Handles socket messages
     * @param msg message buffer
     */
    private MessageHandler;
    /**
     * GenMsg() - Generates messages to send
     * Format: <Message type [UInt8] | MessageId [UInt32LE] | Timestamp [UInt32LE] | Content...>
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
     * SendAck() - Send an acknowledgement
     * @param message - Message to acknowledge
     */
    private SendAck;
    /**
     * ReadConfigFile() - Reads JSON config file and sets this.address_ and this.pwd_
     * @param config_file_loc location of file
     */
    private ReadConfigFile;
}
