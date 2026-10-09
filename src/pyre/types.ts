export type Headers = Record<string, string>;

export type EnterEvent = {
  type: "ENTER";
  peerUuid: string;
  peerName: string;
  headers: Headers;
  endpoint: string;
};

export type ExitEvent = {
  type: "EXIT";
  peerUuid: string;
  peerName: string;
};

export type JoinEvent = {
  type: "JOIN";
  peerUuid: string;
  peerName: string;
  group: string;
};

export type LeaveEvent = {
  type: "LEAVE";
  peerUuid: string;
  peerName: string;
  group: string;
};

export type WhisperEvent = {
  type: "WHISPER";
  peerUuid: string;
  peerName: string;
  content: Buffer[];
};

export type ShoutEvent = {
  type: "SHOUT";
  peerUuid: string;
  peerName: string;
  group: string;
  content: Buffer[];
};

export type StopEvent = {
  type: "STOP";
  peerUuid: string;
  peerName: string;
};

export type PyreEvent =
  | EnterEvent
  | ExitEvent
  | JoinEvent
  | LeaveEvent
  | WhisperEvent
  | ShoutEvent
  | StopEvent;

export type MessageContent = string | Buffer | Array<string | Buffer>;

export type PyreOptions = {
  name?: string;
  /** UDP discovery port. Defaults to 5670 (IANA ZRE-DISC). */
  port?: number;
  /** Beacon interval in milliseconds. Defaults to 1000. */
  interval?: number;
  /** Network interface name, e.g. eth0. */
  interface?: string;
  verbose?: boolean;
};

export type Logger = {
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};
