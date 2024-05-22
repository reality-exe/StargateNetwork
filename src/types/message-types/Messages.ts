export type CloseWormhole = {
  type: string;
};

export type DialRequest = {
  type: string;
  gate_address: string;
};
export type ValidateAddress = {
  type: string;
  gate_address: string;
};

export type RequestAddress = {
  type: string;
  gate_address: string;
  gate_code: string;
  host_id: string;
  is_headless: boolean;
  session_id: string;
  current_users: number;
  max_users: number;
  public: boolean;
  gate_name: string;
};

export type UpdateData = {
  type: string;
  currentUsers: number;
  maxUsers: number;
  gate_status: string;
  irisState: boolean;
};

export type UpdateIris = {
  type: string;
  iris_state: string;
};

export enum Type {
  RequestAddress = "requestAddress",
  ValidateAddress = "validateAddress",
  DialRequest = "dialRequest",
  UpdateData = "updateData",
  CloseWormhole = "closeWormhole",
  UpdateIris = "updateIris",
  KeepAlive = "keepAlive",
}
