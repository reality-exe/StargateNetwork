import { GateStatus } from "../Stargate";

export type SessionCache = {
  gate_id: string;
  gate_address: string;
  gate_code: string;
  gate_owner: string;
  session_url: string;
  gate_status: GateStatus;
  connection_status: ConnectionStatus;
};

export enum GateStatusCache {
  Idle = "IDLE",
  Incoming = "INCOMING",
  Outgoing = "OUTGOING",
}

export type ConnectionStatus = {
  gate_status: GateStatusCache;
  gate_id: string;
  gate_address: string;
  gate_code: string;
  gate_iris: boolean;
};
