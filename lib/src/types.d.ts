/// <reference types="node" />
import { AllSettings } from "camera-interface";
import { ClientMsgType, CameraMsgType } from "./enums";
export declare type ClientMsg = {
    id: number;
    timestamp: number;
    type: ClientMsgType;
    msg: Buffer;
};
export declare type ClientParsedMsg = {
    id: number;
    timestamp: number;
    type: ClientMsgType;
    msg: Buffer;
};
export declare type CameraMsg = {
    id: number;
    timestamp: number;
    type: CameraMsgType;
    msg: Buffer;
};
export declare type CameraParsedMsg = {
    id: number;
    timestamp: number;
    type: CameraMsgType;
    msg: Buffer;
};
export declare type CameraSideEvents = {
    ready: () => void;
    settings: (settings: AllSettings) => void;
    error: (error: Error) => void;
};
