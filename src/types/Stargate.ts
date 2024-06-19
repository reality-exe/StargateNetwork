export type StargateList = {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: Stargate[];
};

export type Stargate = {
  active_users: number;
  gate_address: string;
  gate_code: string;
  gate_status: GateStatus;
  id: string;
  iris_state: boolean;
  is_headless: boolean;
  max_users: number;
  owner_name: string;
  public_gate: boolean;
  session_name: string;
  session_url: string;
  updated: Date;
  created: Date;
};

export enum GateStatus {
  IDLE = "IDLE",
  INCOMING7 = "INCOMING7",
  INCOMING8 = "INCOMING8",
  INCOMING9 = "INCOMING9",
  OPEN = "OPEN",
}
