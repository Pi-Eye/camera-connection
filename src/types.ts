import { AllSettings } from "camera-interface";
import { ClientMsgType, CameraMsgType } from "./enums";

export type ClientMsg = {
  id: number;
  timestamp: number;
  type: ClientMsgType;
  msg: Buffer;
}

export type ClientParsedMsg = {
  id: number;
  timestamp: number;
  type: ClientMsgType;
  msg: Buffer;
}

export type CameraMsg = {
  id: number;
  timestamp: number;
  type: CameraMsgType;
  msg: Buffer;
}

export type CameraParsedMsg = {
  id: number;
  timestamp: number;
  type: CameraMsgType;
  msg: Buffer;
}

export type CameraSideEvents = {
  ready: () => void;
  settings: (settings: AllSettings) => void;
  error: (error: Error) => void;
}